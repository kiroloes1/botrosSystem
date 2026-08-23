const Invoice = require(`${__dirname}/../../models/invoices`);
const Product = require(`${__dirname}/../../models/products`);
const customerModel = require(`${__dirname}/../../models/people/customer`);
const PaymentModel = require(`${__dirname}/../../models/payment`);
const mongoose = require("mongoose");
const SalesReturn=require(`${__dirname}/../../models/return`)

// create Invoice
exports.createInvoice = async (req, res) => {
  let session = null;
  try {
    const { userId } = req.user;
    const { CustomerId, invoiceDate, discount = 0, adminNote } = req.body;

    // 1. Parsing Inputs
    const items = typeof req.body.items === "string" 
      ? JSON.parse(req.body.items) 
      : req.body.items || [];

    const rawPayments = typeof req.body.payment === "string" 
      ? JSON.parse(req.body.payment) 
      : req.body.payment || [];

    const payments = Array.isArray(rawPayments) ? rawPayments : [rawPayments];

    // 2. Validations
    if (!items.length) {
      return res.status(400).json({ message: "يجب علي الاقل لاتمام الطلب يوجد منتج واحد !" });
    }

    for (const p of payments) {
      if (p.paymentMethod === "wallet" && !p.walletInfo?.senderPhone) {
        return res.status(400).json({ message: "يجب عليك ارفاق رقم المحفظة المحول منها" });
      }
    }

    // 3. Start Session & Transaction
    session = await mongoose.startSession();
    session.startTransaction();

    const customer = await customerModel.findById(CustomerId).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "هذا العميل غير موجود" });
    }

    const oldCustomerBalance = customer.balance;

    // 4. Consolidation & Stock Deduction Logic
    // تجميع إجمالي القطع المطلوبة لكل منتج لتجنب التعارض عند تكرار المنتج بالجدول
    const productDeductionMap = {};

    for (const item of items) {
      if (!item.product || !item.quantity || !item.price) {
        throw new Error("يجب ارسال بيانات المنتجات بشكل صحيح");
      }

      if (isNaN(item.quantity) || isNaN(item.price)) {
        throw new Error("الكميات والأسعار يجب أن تكون أرقاماً صحيحة");
      }

      const productId = item.product.toString();
      
      if (!productDeductionMap[productId]) {
        const productRef = await Product.findById(item.product).session(session);
        if (!productRef) {
          throw new Error(`المنتج غير موجود: ${item.productName || item.product}`);
        }
        productDeductionMap[productId] = {
          productRef,
          totalUnitsToDeduct: 0
        };
      }

      // تحويل المطلوبة إلى قطع أصلية (Base Units)
      const unitsPerPkg = productDeductionMap[productId].productRef.unitsPerPackage || 1;
      const neededUnits = item.unit_type === "كرتونة" 
        ? Number(item.quantity) * unitsPerPkg 
        : Number(item.quantity);

      productDeductionMap[productId].totalUnitsToDeduct += neededUnits;
      item.subtotal = Number(item.quantity) * Number(item.price);
    }

    // التحقق والخصم الفعلي من وثيقة المنتج
    for (const productId in productDeductionMap) {
      const { productRef, totalUnitsToDeduct } = productDeductionMap[productId];

      // التأكد من أن الرصيد المتاح بالقطع يغطي المطلوب
      if (productRef.totalUnits < totalUnitsToDeduct) {
        throw new Error(
          `الكمية المتاحة للمنتج (${productRef.productName}) غير كافية! المتاح: ${productRef.totalUnits} قطعة، والمطلوب: ${totalUnitsToDeduct} قطعة`
        );
      }

      // خصم إجمالي الوحدات
      productRef.totalUnits -= totalUnitsToDeduct;

      // تحديث availableQuantity بناءً على وحدة القياس الرئيسية للمنتج
      if (productRef.unit_type === "كرتونة") {
        productRef.availableQuantity = Math.floor(productRef.totalUnits / (productRef.unitsPerPackage || 1));
      } else {
        productRef.availableQuantity = productRef.totalUnits;
      }

      await productRef.save({ session });
    }

    // 5. Calculations
    const totalPrice = items.reduce((acc, curr) => acc + (Number(curr.quantity) * Number(curr.price)), 0);
    const totalDiscount = (totalPrice * Number(discount)) / 100;
    const finalPrice = totalPrice - totalDiscount;

    const totalPaid = payments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const netPrice = finalPrice - totalPaid;

    // Update Customer Balance
    customer.balance += netPrice;
    await customer.save({ session });

    // Determine Invoice Status
    let status = "unpaid";
    if (netPrice <= 0) {
      status = "paid";
    }

    // 6. Create Invoice
    const [createInvoice] = await Invoice.create(
      [{
        user: userId,
        customer: CustomerId,
        items,
        totalPrice,
        discount,
        
        paidAmount:Number(totalPaid.toFixed(2)),
        finalPrice: Number(finalPrice.toFixed(2)),
        invoiceDate: invoiceDate || new Date(),
        oldCustomerBalance,
        status,
        adminNote: adminNote || "لا يوجد ملاحظات"
      }],
      { session }
    );

    // 7. Create Payments Records
    for (const p of payments) {
      if (!p.amount || p.amount <= 0) continue;

      let walletInfo = null;
      let bankInfo = null;

      if (p.paymentMethod === "wallet" && p.walletInfo) {
        walletInfo = {
          senderName: p.walletInfo.senderName,
          senderPhone: p.walletInfo.senderPhone,
          receiverName: p.walletInfo.receiverName,
          receiverPhone: p.walletInfo.receiverPhone,
        };
      }

      if ((p.paymentMethod === "bank" || p.paymentMethod === "instapay") && p.bankInfo) {
        bankInfo = { bankName: p.bankInfo.bankName };
      }

      await PaymentModel.create(
        [{
          customer: CustomerId,
          supplier: null,
          module: "invoices",
          moduleId: createInvoice._id,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          moneyFlow: "incoming",
          walletInfo,
          bankInfo,
          transactionDate: invoiceDate || new Date(),
          createdBy: userId,
          notes: adminNote || "لا يوجد ملاحظات مذكوره"
        }],
        { session }
      );
    }

    // Commit Transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "تم انشاء الطلب بنجاح",
      createInvoice
    });

  } catch (err) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }

    return res.status(400).json({
      message: err.message || "حدث خطأ أثناء إنشاء الفاتورة"
    });
  }
};


// update Invoice
exports.updateInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { userId } = req.user;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("ID الفاتورة غير صحيح");
    }

    const {
      CustomerId,
      invoiceDate,
      discount = 0,
      adminNote,
      items = [],
      payment = []
    } = req.body;

    // Parsing inputs
    const parsedItems = typeof items === "string" ? JSON.parse(items) : items;
    const rawPayments = typeof payment === "string" ? JSON.parse(payment) : payment;
    const payments = Array.isArray(rawPayments) ? rawPayments : [rawPayments];

    if (!parsedItems.length) {
      throw new Error("يجب على الأقل لإتمام الطلب وجود منتج واحد!");
    }

    // 1. retrive old Invoices and customer
    const oldInvoice = await Invoice.findById(id).session(session);
    if (!oldInvoice) throw new Error("الفاتورة غير موجودة");

    const customerDoc = await customerModel.findById(oldInvoice.customer).session(session);
    if (!customerDoc) throw new Error("العميل غير موجود");

    // ==========================================
    // 2. ROLLBACK OLD EFFECT
    // ==========================================

    // return effect on product
    for (const oldItem of oldInvoice.items) {
      const productRef = await Product.findById(oldItem.product).session(session);
      if (productRef) {
        if (oldItem.unit_type === "قطعة") {
          productRef.totalUnits += Number(oldItem.quantity);
          if (productRef.unit_type === "كرتونة") {
            productRef.availableQuantity = Math.floor(
              productRef.totalUnits / productRef.unitsPerPackage
            );
          } else {
            productRef.availableQuantity += Number(oldItem.quantity);
          }
        } else if (oldItem.unit_type === "كرتونة") {
          productRef.availableQuantity += Number(oldItem.quantity);
          productRef.totalUnits += Number(oldItem.quantity) * productRef.unitsPerPackage;
        }
        await productRef.save({ session });
      }
    }

    // net = finalPrice - totalPaid
    const oldPayments = await PaymentModel.find({
      moduleId: id,
      module: "invoices",
    }).session(session);

    const oldTotalPaid = oldPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const oldNetPrice = oldInvoice.finalPrice - oldTotalPaid;

    // return this effect to customer
    customerDoc.balance -= oldNetPrice;

    // delete old payments
    await PaymentModel.deleteMany({
      moduleId: id,
      module: "invoices",
    }).session(session);

    // ==========================================
    // 2.5 DETECT QUANTITY DECREASE -> BUILD AUTO RETURN ITEMS
    // (مقارنة كمية الفاتورة القديمة بالكمية الجديدة المرسلة)
    // ==========================================
    const oldItemsMap = new Map();
    for (const oldItem of oldInvoice.items) {
      const key = `${oldItem.product}_${oldItem.unit_type}`;
      const prev = oldItemsMap.get(key);
      if (prev) {
        prev.quantity += Number(oldItem.quantity);
      } else {
        oldItemsMap.set(key, {
          product: oldItem.product,
          productName: oldItem.productName,
          unit_type: oldItem.unit_type,
          quantity: Number(oldItem.quantity),
          price: oldItem.price,
        });
      }
    }

    const newItemsMap = new Map();
    for (const item of parsedItems) {
      const key = `${item.product}_${item.unit_type}`;
      const prev = newItemsMap.get(key);
      if (prev) {
        prev.quantity += Number(item.quantity);
      } else {
        newItemsMap.set(key, { quantity: Number(item.quantity) });
      }
    }

    const autoReturnItems = [];

    for (const [key, oldData] of oldItemsMap.entries()) {
      const newQty = newItemsMap.get(key)?.quantity || 0;
      const diff = oldData.quantity - newQty; // موجب = نقصان = مرتجع

      if (diff > 0) {
        autoReturnItems.push({
          product: oldData.product,
          productName: oldData.productName,
          unit_type: oldData.unit_type,
          invoiceQuantity: oldData.quantity,
          returnQuantity: diff,
          price: oldData.price,
          subtotal: diff * oldData.price,
        });
      }
    }

    // ==========================================
    // 3. APPLY NEW CALCULATIONS & INVENTORY REDUCTION
    // ==========================================

    let totalPrice = 0;

    for (const item of parsedItems) {
      if (!item.product || !item.quantity || !item.price) {
        throw new Error("يجب إرسال كافة بيانات المنتج (المنتج، الكمية، السعر)");
      }

      if (isNaN(item.quantity) || isNaN(item.price)) {
        throw new Error("الكميات والأسعار يجب أن تكون أرقاماً صحيحة");
      }

      const productRef = await Product.findById(item.product).session(session);
      if (!productRef) {
        throw new Error(`المنتج غير موجود: ${item.product}`);
      }

      if (item.unit_type === "قطعة") {
        productRef.totalUnits -= Number(item.quantity);
        if (productRef.unit_type === "كرتونة") {
          productRef.availableQuantity = Math.floor(
            productRef.totalUnits / productRef.unitsPerPackage
          );
        } else {
          productRef.availableQuantity -= Number(item.quantity);
        }
      } else if (item.unit_type === "كرتونة") {
        productRef.availableQuantity -= Number(item.quantity);
        productRef.totalUnits -= Number(item.quantity) * productRef.unitsPerPackage;
      }

      await productRef.save({ session });

      item.subtotal = Number(item.quantity) * Number(item.price);
      totalPrice += item.subtotal;
    }

    const totalDiscount = (totalPrice * Number(discount)) / 100;
    const finalPrice = totalPrice - totalDiscount;

    const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const netPrice = finalPrice - totalPaid;

    customerDoc.balance += netPrice;
    await customerDoc.save({ session });

    let status = netPrice <= 0 ? "paid" : "unpaid";

    // ==========================================
    // 4. UPDATE INVOICE DOC
    // ==========================================

    const updatedInvoice = await Invoice.findByIdAndUpdate(
      id,
      {
        customer: CustomerId || oldInvoice.customer,
        user: userId,
        items: parsedItems,
        totalPrice,
          paidAmount:Number(totalPaid.toFixed(2)),
        discount,
        finalPrice: Number(finalPrice.toFixed(2)),
        invoiceDate: invoiceDate || oldInvoice.invoiceDate,
        status,
        adminNote: adminNote || "لا يوجد ملاحظات",
      },
      { new: true, session }
    );

    // ==========================================
    // 4.5 CREATE AUTO SALES RETURN (IF QUANTITY DECREASED)
    // ==========================================
    if (autoReturnItems.length > 0) {
      const totalReturnAmount = autoReturnItems.reduce(
        (acc, i) => acc + i.subtotal,
        0
      );

      await SalesReturn.create(
        [
          {
            invoice: updatedInvoice._id,
            customer: customerDoc._id,
            user: userId,
            returnDate: invoiceDate || new Date(),
            items: autoReturnItems,
            totalAmount: totalReturnAmount,
            note: "مرتجع تلقائي تم إنشاؤه أثناء تعديل الفاتورة",
            type:"invoice"
          },
        ],
        { session }
      );
    }

    // ==========================================
    // 5. CREATE NEW PAYMENTS
    // ==========================================

    for (const p of payments) {
      if (!p.amount || p.amount <= 0) continue;

      let walletInfo = null;
      let bankInfo = null;

      if (p.paymentMethod === "wallet") {
        if (!p.walletInfo?.senderPhone) {
          throw new Error("يجب إرفاق رقم المحفظة المحول منها");
        }
        walletInfo = {
          senderName: p.walletInfo.senderName,
          senderPhone: p.walletInfo.senderPhone,
          receiverName: p.walletInfo.receiverName,
          receiverPhone: p.walletInfo.receiverPhone,
        };
      }

      if ((p.paymentMethod === "bank" || p.paymentMethod === "instapay") && p.bankInfo) {
        bankInfo = { bankName: p.bankInfo.bankName };
      }

      await PaymentModel.create(
        [
          {
            customer: customerDoc._id,
            supplier: null,
            module: "invoices",
            moduleId: updatedInvoice._id,
            amount: Number(p.amount),
            paymentMethod: p.paymentMethod,
            moneyFlow: "incoming",
            walletInfo,
            bankInfo,
            transactionDate: invoiceDate || new Date(),
            createdBy: userId,
            notes: adminNote || "تعديل فاتورة",
          },
        ],
        { session }
      );
    }

    // Commit Transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم تعديل الفاتورة بنجاح",
      invoice: updatedInvoice,
      autoReturn: autoReturnItems.length > 0 ? autoReturnItems : null,
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      message: err.message || "حدث خطأ أثناء تعديل الفاتورة",
    });
  }
};

// delete Invoice

exports.deleteInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("ID الفاتورة غير صحيح");
    }

  
    const oldInvoice = await Invoice.findById(id).session(session);
    if (!oldInvoice) {
      throw new Error("الفاتورة غير موجودة أو تم حذفها بالفعل");
    }

  
    const customerDoc = await customerModel.findById(oldInvoice.customer).session(session);
    if (!customerDoc) {
      throw new Error("العميل المرتبط بالفاتورة غير موجود");
    }

    // ==========================================
    // ROLLBACK OLD EFFECT 
    // ==========================================


    for (const oldItem of oldInvoice.items) {
      const productRef = await Product.findById(oldItem.product).session(session);
      if (productRef) {
        if (oldItem.unit_type === "قطعة") {
          productRef.totalUnits += Number(oldItem.quantity);
          if (productRef.unit_type === "كرتونة") {
            productRef.availableQuantity = Math.floor(
              productRef.totalUnits / productRef.unitsPerPackage
            );
          } else {
            productRef.availableQuantity += Number(oldItem.quantity);
          }
        } else if (oldItem.unit_type === "كرتونة") {
          productRef.availableQuantity += Number(oldItem.quantity);
          productRef.totalUnits += Number(oldItem.quantity) * productRef.unitsPerPackage;
        }
        await productRef.save({ session });
      }
    }

    const oldPayments = await PaymentModel.find({
      moduleId: id,
      module: "invoices",
    }).session(session);

    const oldTotalPaid = oldPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const oldNetPrice = oldInvoice.finalPrice - oldTotalPaid;

    customerDoc.balance -= oldNetPrice;
    await customerDoc.save({ session });


    await PaymentModel.deleteMany({
      moduleId: id,
      module: "invoices",
    }).session(session);

    await SalesReturn.deleteMany({invoice:id})
    await Invoice.findByIdAndDelete(id).session(session);

    

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم حذف الفاتورة وإلغاء كافة تأثيراتها على المخزون والحسابات بنجاح",
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      message: err.message || "حدث خطأ أثناء حذف الفاتورة",
    });
  }
};



// Get all Invoices with Search & Filters
exports.getInvoices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, status, customer, startDate, endDate } = req.query;

    // 1. Build Query Criteria
    let query = {};

    // Filter by Invoice Status (paid / unpaid / return)
    if (status) {
      query.status = status;
    }

    // Filter by Customer ID
    if (customer && mongoose.Types.ObjectId.isValid(customer)) {
      query.customer = customer;
    }

    // Filter by Date Range
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) {
        query.invoiceDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.invoiceDate.$lte = end;
      }
    }

    // Search Logic (by Invoice Mongo ID, Order Number, Customer Name, or Customer Phone)
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      const searchConditions = [];

      // A. Search by Order Number (e.g., "AGI-1" or "1")
      searchConditions.push({ orderNumber: { $regex: searchTerm, $options: "i" } });

      // B. Check if search term is a valid ObjectId (to search directly by Invoice _id)
      if (mongoose.Types.ObjectId.isValid(searchTerm)) {
        searchConditions.push({ _id: searchTerm });
      }

      // C. Find matching customers by Name or Phone
      const matchingCustomers = await customerModel.find({
        $or: [
          { name: { $regex: searchTerm, $options: "i" } },
          { phone: { $regex: searchTerm, $options: "i" } },
        ],
      }).select("_id");

      const customerIds = matchingCustomers.map((c) => c._id);
      
      if (customerIds.length > 0) {
        searchConditions.push({ customer: { $in: customerIds } });
      }

      // Combine conditions using $or
      if (searchConditions.length > 0) {
        query.$or = searchConditions;
      } else {
        // If search term didn't match anything, return empty result
        query._id = null;
      }
    }

    // 2. Count Total Matching Documents
    const totalInvoices = await Invoice.countDocuments(query);

    // 3. Fetch Invoices with Selection (including orderNumber) and Pagination
    const invoices = await Invoice.find(query)
      .populate("customer", "name phone")
      .select("orderNumber customer invoiceNumber invoiceDate finalPrice status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalInvoices / limit);

    return res.status(200).json({
      message: "Invoices retrieved successfully",
      pagination: {
        totalInvoices,
        currentPage: page,
        totalPages,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      data: invoices,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "An error occurred while fetching invoices",
    });
  }
};

// getInvoiceBy id
exports.getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID الفاتورة غير صحيح" });
    }

   
    const invoice = await Invoice.findById(id)
      .populate("customer", "name phone balance") 
      .populate("user", "name email") 
      .populate("items.product", "productName code price unit_type"); 

    if (!invoice) {
      return res.status(404).json({ message: "الفاتورة غير موجودة" });
    }

  
    const payments = await PaymentModel.find({
      moduleId: id,
      module: "invoices",
    }).populate("createdBy", "name");

    const returnInvoice=await SalesReturn.find({
        invoice:id
    })

    
    const totalPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const remainingAmount = invoice.finalPrice - totalPaid;

    return res.status(200).json({
      message: "تم جلب تفاصيل الفاتورة بنجاح",
      data: {
        invoice,
        payments,
        returnInvoice,
        summary: {
          totalPrice: invoice.totalPrice,
          discount: invoice.discount,
          finalPrice: invoice.finalPrice,
          totalPaid,
          remainingAmount: Number(remainingAmount.toFixed(2)),
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "حدث خطأ أثناء جلب تفاصيل الفاتورة",
    });
  }
};
exports.getInvoicesByCustomer = async (req, res) => {
    try {
        const { customerId } = req.query;

        const {
            fromDate,
            toDate,
            minAmount,
            maxAmount,
            hasRemaining,
            paymentMethod,
        } = req.query;

        // =========================
        // Validate Customer ID
        // =========================

        if (!mongoose.Types.ObjectId.isValid(customerId)) {
            return res.status(400).json({
                message: "Customer ID غير صحيح",
            });
        }

        // =========================
        // Invoice Filter
        // =========================

        const filter = {
            customer: customerId,
        };

        // =========================
        // Date Filter
        // =========================

        if (fromDate || toDate) {
            filter.invoiceDate = {};

            if (fromDate) {
                const from = new Date(fromDate);

                if (!isNaN(from.getTime())) {
                    filter.invoiceDate.$gte = from;
                }
            }

            if (toDate) {
                const to = new Date(toDate);

                if (!isNaN(to.getTime())) {
                    // نهاية اليوم
                    to.setHours(
                        23,
                        59,
                        59,
                        999
                    );

                    filter.invoiceDate.$lte = to;
                }
            }
        }

        // =========================
        // Amount Filter
        // =========================

        if (
            minAmount !== undefined ||
            maxAmount !== undefined
        ) {
            filter.finalPrice = {};

            if (minAmount !== undefined) {
                filter.finalPrice.$gte =
                    Number(minAmount);
            }

            if (maxAmount !== undefined) {
                filter.finalPrice.$lte =
                    Number(maxAmount);
            }
        }

        // =========================
        // Get Invoices
        // =========================

        let invoices = await Invoice.find(filter)
            .populate(
                "customer",
                "name balance phone"
            )
            .populate(
                "user",
                "username email"
            )
            .populate(
                "items.product",
                "productName"
            )
            .sort({
                invoiceDate: -1
            })
            .lean();

        // =========================
        // Invoice IDs
        // =========================

        const invoiceIds = invoices.map(
            invoice => invoice._id
        );

        // =========================
        // Get Payments
        // =========================

        const payments = invoiceIds.length
            ? await PaymentModel.find({
                module: "invoices",
                moduleId: {
                    $in: invoiceIds
                },
            }).lean()
            : [];

        // =========================
        // Group Payments By Invoice
        // =========================

        const paymentsMap = new Map();

        for (const payment of payments) {
            const invoiceId =
                payment.moduleId.toString();

            if (!paymentsMap.has(invoiceId)) {
                paymentsMap.set(
                    invoiceId,
                    []
                );
            }

            paymentsMap
                .get(invoiceId)
                .push(payment);
        }

        // =========================
        // Get Returns
        // =========================

        const returnInvoices = invoiceIds.length
            ? await SalesReturn.find({
                invoice: {
                    $in: invoiceIds
                }
            }).lean()
            : [];

        // =========================
        // Group Returns By Invoice
        // =========================

        const returnsMap = new Map();

        for (const returnInvoice of returnInvoices) {

            if (!returnInvoice.invoice) {
                continue;
            }

            const invoiceId =
                returnInvoice.invoice.toString();

            if (!returnsMap.has(invoiceId)) {
                returnsMap.set(
                    invoiceId,
                    []
                );
            }

            returnsMap
                .get(invoiceId)
                .push(returnInvoice);
        }

        // =========================
        // Calculate Payment + Returns
        // =========================

        invoices = invoices.map(invoice => {

            const invoiceId =
                invoice._id.toString();

            // =========================
            // Payments
            // =========================

            const invoicePayments =
                paymentsMap.get(invoiceId) || [];

            // =========================
            // Returns
            // =========================

            const invoiceReturns =
                returnsMap.get(invoiceId) || [];

            // =========================
            // Payment Data
            // =========================

            const payment =
                invoicePayments.map(p => ({
                    paymentMethod:
                        p.paymentMethod,

                    paidAmount:
                        Number(p.amount) || 0,
                }));

            // =========================
            // Total Paid
            // =========================

            const paidAmount =
                payment.reduce(
                    (sum, p) =>
                        sum +
                        (Number(p.paidAmount) || 0),
                    0
                );

            // =========================
            // Remaining
            // =========================

            const remainingAmount =
                Math.max(
                    0,
                    (Number(invoice.finalPrice) || 0) -
                    paidAmount
                );

            // =========================
            // Total Returns
            // =========================

            const totalReturned =
                invoiceReturns.reduce(
                    (sum, r) =>
                        sum +
                        (Number(r.totalAmount) || 0),
                    0
                );

            return {
                ...invoice,

                // Payments
                Payments:
                    invoicePayments,

                payment,

                paidAmount,

                remainingAmount,

                // Returns
                returns:
                    invoiceReturns,

                totalReturned,
            };
        });

        // =========================
        // Payment Method Filter
        // =========================

        if (paymentMethod) {
            invoices =
                invoices.filter(invoice =>
                    invoice.payment.some(
                        p =>
                            p.paymentMethod ===
                            paymentMethod
                    )
                );
        }

        // =========================
        // Remaining Filter
        // =========================

        if (hasRemaining === "true") {

            invoices =
                invoices.filter(
                    invoice =>
                        invoice.remainingAmount > 0
                );

        } else if (hasRemaining === "false") {

            invoices =
                invoices.filter(
                    invoice =>
                        invoice.remainingAmount === 0
                );
        }

        // =========================
        // Response
        // =========================

        const total = invoices.length;

        return res.status(200).json({
            results: invoices.length,
            total,
            invoices,
        });

    } catch (err) {

        console.error(
            "getInvoicesByCustomer Error:",
            err
        );

        return res.status(500).json({
            message: err.message,
        });
    }
};

exports.searchInvoice = async (req, res) => {
    try {
        const {
            search,
            page: pageQuery,
            limit: limitQuery
        } = req.query;

        const page = Math.max(1, Number(pageQuery) || 1);
        const limit = Math.max(1, Number(limitQuery) || 5);
        const skip = (page - 1) * limit;

        const pipeline = [
            // 1. ربط جدول العملاء أولاً
            {
                $lookup: {
                    from: "customers",
                    localField: "customer",
                    foreignField: "_id",
                    as: "customer"
                }
            },
            {
                $unwind: {
                    path: "$customer",
                    preserveNullAndEmptyArrays: true
                }
            }
        ];

        // 2. الفلترة برقم الفاتورة أو اسم العميل بعد الـ lookup
        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        {
                            invoiceNumber: {
                                $regex: search,
                                $options: "i"
                            }
                        },
                        {
                            "customer.name": {
                                $regex: search,
                                $options: "i"
                            }
                        }
                    ]
                }
            });
        }

        // 3. الترتيب والتصفيف (Pagination)
        pipeline.push(
            {
                $sort: {
                    invoiceDate: -1
                }
            },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limit }
                    ],
                    total: [
                        { $count: "count" }
                    ]
                }
            }
        );

        const result = await Invoice.aggregate(pipeline);

        const invoices = result[0]?.data || [];
        const total = result[0]?.total[0]?.count || 0;

        res.status(200).json({
            invoices,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            results: invoices.length
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: error.message
        });
    }
};