const customerModel=require(`${__dirname}/../../models/people/customer`);
const mongoose =require('mongoose')
const axios =require(`axios`);
const PaymentModel=require(`${__dirname}/../../models/payment`)
  const paymentMethodTranslation=(method)=>{
     if(method=="cash"){
      return "نقدي";
     }
     else if(method=="cash"){
        return "نقدي";
     }
          else if(method=="wallet"){
        return "محفظه";
     }
          else if(method=="bank"){
        return "بنك";
     }
          else if(method=="instapay"){
        return "انستا باي";
     }
          else if(method=="mail"){
        return "بريد";
     }
               else if(method=="cheque"){
        return "شيك";
     }
               else if(method=="work"){
        return "شغل";
     }else{
      return method
     }
  }
// ================= GET ALL =================
exports.getAllCustomers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const total = await customerModel.countDocuments();

    const Customers = await customerModel
      .find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
     
      

    res.status(200).json({
      message: "Success",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
      data: Customers,
    });

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.getAllCustomerName = async (req, res) => {
  try {
    const Customers = await customerModel.find({},{_id:1,name:1,balance:1}).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Success",
      data: Customers,
    });
  } catch (err) {
    res.status(500).json({ message:err.message });
  }
};


// ================= GET BY ID =================
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const Customer = await customerModel.findById(id);

    if (!Customer)
      return res.status(404).json({ message: "هذا العميل غير موجود" });


        const payments = await PaymentModel.find({
      customer: id,
      amount: { $gt: 0 }
    })
      .populate("createdBy", "username email")
      .populate("updatedBy", "username email")
      .lean();

      



    res.status(200).json({
      message: "Success",
      data: Customer,
         payment:payments
    });

  } catch (err) {
    res.status(500).json({ message: "حدث خطاء ما في السيرفر", err });
  }
};

// ================= CREATE =================
exports.createNewCustomer = async (req, res) => {
  try {
    const { name, phone, notes , openBalance } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        message: "اسم العميل مطلوب"
      });
    }
    if(!phone){
       return res.status(400).json({
        message: "رقم الهاتف مطلوب"
      });
    }

    const existCustomer = await customerModel.findOne({ name: name.trim() });

    if (existCustomer) {
      return res.status(409).json({
        message:  " اسم العميل موجود بالفعل من فضلك غير اسمه "
      });
    }


    const newCustomer = await customerModel.create({
      name: name.trim(),
      phone: phone?.trim(),
      notes: notes?.trim(),
      openningBalance:Number(openBalance || 0),
      balance:Number(openBalance || 0)
    });



    res.status(201).json({
      message: "تم اضافه العميل بنجاح",
      data: newCustomer
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= UPDATE =================
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;


    const updates = req.body;


    const oldCustomer = await customerModel.findById(id);

    if (!oldCustomer) {
      return res.status(404).json({
        message: "هذا العميل غير موجود",
      });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "من فضلك املاء جميع الحقول"
      });
    }

    
    if (!updates.name || updates.name.trim().length < 2) {
      return res.status(400).json({
        message: "اسم العميل مطلوب"
      });
    }
    if(!updates.phone){
       return res.status(400).json({
        message: "رقم الهاتف مطلوب"
      });
    }


    const Customer = await customerModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );


    const changes = [];

  if (oldCustomer.name !== Customer.name) {
    changes.push(`الاسم: "${oldCustomer.name}" ← "${Customer.name}"`);
  }

  if (oldCustomer.phone !== Customer.phone) {
    changes.push(`الهاتف: "${oldCustomer.phone}" ← "${Customer.phone}"`);
  }

  if ((oldCustomer.notes || "") !== (Customer.notes || "")) {
    changes.push(
      `الملاحظات: "${oldCustomer.notes || "لا يوجد"}" ← "${Customer.notes || "لا يوجد"}"`
    );
  }

  if (oldCustomer.balance !== Customer.balance) {
    changes.push(
      `الرصيد: ${oldCustomer.balance} ← ${Customer.balance}`
    );
  }


    res.status(200).json({
      message: "تم تحديث بيانات العميل بنجاح",
      data: Customer
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();

  session.startTransaction()
  try {
    const Customer = await customerModel.findById(id);

    if (!Customer) {
      return res.status(404).json({
        message: "هذا المورد غير موجود",
      });
    }

    await customerModel.findByIdAndDelete(id, { session });




    
    await session.commitTransaction();

    res.status(200).json({
      message: "تم حذف بيانات المورد بنجاح",
      data: Customer,
    });
  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      message: err.message,
    });
  } finally {
    session.endSession();
  }
};


//  دفع  عميل 
exports.addDebt= async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { amount, note,paymentMethod ,date } = req.body;
    const userId=req?.user?.userId;

    if (!paymentMethod || !["cash" , "wallet" ,"instapay" ,"work"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "طريقة الدفع غير صحيحة"
      });
    }



    if (!amount || amount <= 0)
      return res.status(400).json({ message: "المبلغ لازم يكون قيمه موجبه" });


    const customer = await customerModel.findById(id).session(session);

    if (!customer)
      return res.status(404).json({ message: "العميل غير موجود" });

   
    const oldcustomer=customer.balance;
    // customer.balance += amount;
    customer.balance = parseFloat((customer.balance + amount).toFixed(2));

    await customer.save({session});



    const paymentData = {
        customer: id,
        module: "pay",
        amount: Number(amount),
        paymentMethod,
        moneyFlow: "outgoing",
        transactionDate: date || new Date(),
        notes: note || "",
        createdBy: userId,
        updatedBy:null
    };

    if ((paymentMethod === "bank" || paymentMethod === "instapay") && !req.body.bankInfo) {
    throw new Error("بيانات البنك مطلوبة");
}




    if (paymentMethod === "wallet") {

    if (!req.body.walletInfo) {
        throw new Error("بيانات المحفظة مطلوبة");
    }

    paymentData.walletInfo = {
        senderName: req.body.walletInfo.senderName,
        senderPhone: req.body.walletInfo.senderPhone,
        receiverName: req.body.walletInfo.receiverName,
        receiverPhone: req.body.walletInfo.receiverPhone,
        
    };


}

    if (paymentMethod === "bank" || paymentMethod === "instapay") {
        paymentData.bankInfo = {
            bankName: req.body.bankInfo.bankName,
            transactionReference: req.body.bankInfo.transactionReference,
        };
    }


await PaymentModel.create([paymentData], { session });




    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "تم اضافه الدين بنجاح",
      balance: customer.balance
    });

  } catch (err) {
      await session.abortTransaction();
      session.endSession();
    res.status(500).json({ message: "Server error",   error: err.message });
  }
};

// استلام فلوس من العميل 
exports.paySupplier  = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { amount, note,paymentMethod ,date } = req.body;
    const userId=req?.user?.userId;

    if (!paymentMethod || !["cash" , "wallet" ,"instapay" ,"work"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "طريقة الدفع غير صحيحة"
      });
    }



    if (!amount || amount <= 0)
      return res.status(400).json({ message: "المبلغ لازم يكون قيمه موجبه" });


    const supplier = await customerModel.findById(id).session(session);

    if (!supplier)
      return res.status(404).json({ message: "العميل غير موجود" });

   
     const oldSupplier=supplier.balance;
    supplier.balance = parseFloat((supplier.balance - amount).toFixed(2));

    await supplier.save({session});

  
    const paymentData = {
        customer: id,
        module: "debt",
        amount: Number(amount),
        paymentMethod,
        moneyFlow: "incoming",
        transactionDate: date || new Date(),
        notes: note || "",
        createdBy: userId,
        updatedBy:null
    };
    if (paymentMethod === "wallet") {

    if (!req.body.walletInfo) {
        throw new Error("بيانات المحفظة مطلوبة");
    }

    paymentData.walletInfo = {
        provider: req.body.walletInfo.provider,
        senderName: req.body.walletInfo.senderName,
        senderPhone: req.body.walletInfo.senderPhone,
        receiverName: req.body.walletInfo.receiverName,
        receiverPhone: req.body.walletInfo.receiverPhone,
        transactionReference: req.body.walletInfo.transactionReference,
    };



}
if ((paymentMethod === "bank" || paymentMethod === "instapay") && !req.body.bankInfo) {
    throw new Error("بيانات البنك مطلوبة");
}

    if (paymentMethod === "bank" || paymentMethod === "instapay") {
        paymentData.bankInfo = {
            bankName: req.body.bankInfo.bankName,
            transactionReference: req.body.bankInfo.transactionReference,
        };
    }



await PaymentModel.create([paymentData], { session });



    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "تم اضافه السداد بنجاح",
      balance: supplier.balance
    });

  } catch (err) {
      await session.abortTransaction();
      session.endSession();
    res.status(500).json({ message: "Server error",   error: err.message });
  }
};


// Get all payments for one customer
exports.allPaymentPerCustomer = async (req, res) => {
  try {
    const { id } = req.params;



    const payments = await PaymentModel
      .find({ customer: id })
      .sort({ createdAt: -1 })


    const totalPayments = await PaymentModel.countDocuments({
      customer: id,
    });



    res.status(200).json({
      message: "تم جلب المدفوعات بنجاح",
      payments:totalPayments,
      totalPayments,
      
    
    });
  } catch (err) {
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};







// =========================================================
// EDIT PAYMENT HISTORY (معدل بالكامل)
// =========================================================
exports.editPaymentHistory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { customerId, paymentId } = req.params; // customerId بدلاً من supplierId
    const { amount, paymentMethod, module, note, date, walletInfo, bankInfo } = req.body;
    const userId = req?.user?.userId;

    // 1. التحقق من صحة البيانات
    if (!paymentMethod || !["cash", "wallet", "instapay", "work", "bank"].includes(paymentMethod)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "طريقة الدفع غير صحيحة" });
    }

    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "المبلغ يجب أن يكون قيمة موجبة" });
    }

    if (!module || !["debt", "pay"].includes(module)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "نوع العملية غير صحيح (debt أو pay)" });
    }

    // 2. جلب العميل
    const customer = await customerModel.findById(customerId).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "العميل غير موجود" });
    }

    // 3. جلب عملية الدفع القديمة
    const oldPayment = await PaymentModel.findById(paymentId).session(session);
    if (!oldPayment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "عملية الدفع غير موجودة" });
    }

    // التأكد أن العملية تخص هذا العميل
    if (oldPayment.customer.toString() !== customerId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: "عملية الدفع لا تخص هذا العميل" });
    }

    // 4. حفظ الرصيد القديم للتسجيل
    const oldBalance = Number(customer.balance || 0);
    const oldAmount = Number(oldPayment.amount || 0);
    const oldModule = oldPayment.module; // "debt" أو "pay"

    // =========================================================
    // 5. عكس تأثير العملية القديمة
    // =========================================================
    // debt = استلام فلوس من العميل (العميل مدين لنا) -> يزيد الرصيد
    // pay = دفع فلوس للعميل (نحن مدينون للعميل) -> يقل الرصيد
    if (oldModule === "debt") {
      customer.balance = parseFloat((customer.balance + oldAmount).toFixed(2));
    } else if (oldModule === "pay") {
      customer.balance = parseFloat((customer.balance - oldAmount).toFixed(2));
    }





    // =========================================================
    // 7. تطبيق تأثير العملية الجديدة
    // =========================================================
    // إعادة تعيين الحقول القديمة
    oldPayment.walletInfo = undefined;
    oldPayment.bankInfo = undefined;
    oldPayment.cheque = undefined;

    // تحديث البيانات الجديدة
    oldPayment.amount = Number(amount);
    oldPayment.paymentMethod = paymentMethod;
    oldPayment.module = module; // "debt" أو "pay"
    oldPayment.notes = note || "";
    oldPayment.transactionDate = date || new Date();
    oldPayment.updatedBy = userId;

    // =========================================================
    // 8. تحديث رصيد العميل بالعملية الجديدة
    // =========================================================
    if (module === "debt") {
      customer.balance = parseFloat((customer.balance - Number(amount)).toFixed(2));
    } else if (module === "pay") {
      customer.balance = parseFloat((customer.balance + Number(amount)).toFixed(2));
    }




    // 9.2 إذا كانت wallet
    if (paymentMethod === "wallet") {
      if (!walletInfo) {
        throw new Error("بيانات المحفظة مطلوبة");
      }

      const walletType = module === "debt" ? "receive" : "send";

      const formData = {
        walletId: walletInfo.walletId,
        senderName: walletInfo.senderName || "",
        receiverName: walletInfo.receiverName || "",
        senderPhone: walletInfo.senderPhone || "",
        receiverPhone: walletInfo.receiverPhone || "",
        type: walletType,
        notes: walletType === "receive"
          ? `عملية استلام أموال من العميل ${customer.name}`
          : `عملية إرسال أموال إلى العميل ${customer.name}`,
        amount: Number(amount),
        createdAt: oldPayment.transactionDate || new Date(),
      };

      // إعداد بيانات المحفظة
      oldPayment.walletInfo = {
        provider: walletInfo.provider || "",
        senderName: walletInfo.senderName || "",
        senderPhone: walletInfo.senderPhone || "",
        receiverName: walletInfo.receiverName || "",
        receiverPhone: walletInfo.receiverPhone || "",
        walletId: walletInfo.walletId || "",
        transactionReference: null,
        linkWallet: false,
      };


    }

    // 9.3 إذا كانت bank أو instapay
    if (paymentMethod === "bank" || paymentMethod === "instapay") {
      if (!bankInfo) {
        throw new Error("بيانات البنك مطلوبة");
      }

      oldPayment.bankInfo = {
        bankName: bankInfo.bankName || "",
        transactionReference: bankInfo.transactionReference || "",
      };
    }


    // =========================================================
    // 10. حفظ التغييرات
    // =========================================================
    await oldPayment.save({ session });
    await customer.save({ session });



    // =========================================================
    // 11. Commit
    // =========================================================
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم تعديل العملية بنجاح",
      payment: oldPayment,
      balance: customer.balance,
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("editPaymentHistory error:", err);

    return res.status(500).json({
      message: err.message || "Server error",
      error: err.message,
    });
  }
};

// =========================================================
// DELETE PAYMENT HISTORY (معدل بالكامل)
// =========================================================
exports.deletePaymentHistory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { customerId, paymentId } = req.params; // customerId بدلاً من supplierId
    const userId = req?.user?.userId;

    // 1. جلب العميل
    const customer = await customerModel.findById(customerId).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "العميل غير موجود" });
    }

    // 2. جلب عملية الدفع
    let payment = await PaymentModel.findById(paymentId).session(session);



    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "عملية الدفع غير موجودة" });
    }

    // التأكد أن العملية تخص هذا العميل
    if (payment.customer.toString() !== customerId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: "عملية الدفع لا تخص هذا العميل" });
    }

    // 3. حفظ البيانات القديمة للتسجيل
    const oldBalance = Number(customer.balance || 0);
    const amount = Number(payment.amount || 0);
    const module = payment.module; // "debt" أو "pay"

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("قيمة عملية الدفع غير صحيحة");
    }

    // =========================================================
    // 4. عكس تأثير العملية (حذفها من الرصيد)
 
    if (module === "debt") {
      customer.balance = parseFloat((customer.balance + amount).toFixed(2));
    } else if (module === "pay") {
      customer.balance = parseFloat((customer.balance - amount).toFixed(2));
    }

    // =========================================================
    // 5. حذف السجلات المرتبطة
    // =========================================================







    // =========================================================
    // 6. حذف عملية الدفع نفسها
    // =========================================================
    await PaymentModel.findByIdAndDelete(payment._id).session(session);

    // =========================================================
    // 7. حفظ العميل
    // =========================================================
    await customer.save({ session });


    // =========================================================
    // 9. Commit
    // =========================================================
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم حذف العملية بنجاح",
      balance: customer.balance,
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("deletePaymentHistory error:", err);

    return res.status(500).json({
      message: err.message || "Server error",
      error: err.message,
    });
  }
};
