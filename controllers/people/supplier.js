const supplierModel=require(`${__dirname}/../../models/people/supplier`);
const mongoose =require('mongoose')
const axios =require(`axios`);
const paymentModel=require(`${__dirname}/../../models/payment`)

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
exports.getAllSuppliers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const total = await supplierModel.countDocuments();

    const suppliers = await supplierModel
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
      data: suppliers,
    });

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.getAllSupplierName = async (req, res) => {
  try {
    const suppliers = await supplierModel.find({},{_id:1,name:1,balance:1}).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Success",
      data: suppliers,
    });
  } catch (err) {
    res.status(500).json({ message:err.message });
  }
};


// ================= GET BY ID =================
exports.getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await supplierModel.findById(id);




    if (!supplier)
      return res.status(404).json({ message: "هذا التاجر غير موجود" });

    
        const payments = await paymentModel.find({
        supplier: id,
        amount: { $gt: 0 }
    })
      .populate("createdBy", "username email")
      .populate("updatedBy", "username email")
      .lean();

      

    res.status(200).json({
      message: "Success",
      data: supplier,
    payment:payments

    });

  } catch (err) {
    res.status(500).json({ message: "حدث خطاء ما في السيرفر " ,err});
  }
};

// ================= CREATE =================
exports.createNewSupplier = async (req, res) => {
  try {
    const { name, phone, notes , openBalance } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        message: "اسم التاجر مطلوب"
      });
    }
    if(!phone){
       return res.status(400).json({
        message: "رقم الهاتف مطلوب"
      });
    }

    const existSupplier = await supplierModel.findOne({ name: name.trim() });

    if (existSupplier) {
      return res.status(409).json({
        message:  " اسم التاجر موجود بالفعل من فضلك غير اسمه "
      });
    }


    const newSupplier = await supplierModel.create({
      name: name.trim(),
      phone: phone?.trim(),
      notes: notes?.trim(),
      openningBalance:Number(openBalance || 0),
      balance:Number(openBalance || 0)
    });


    res.status(201).json({
      message: "تم اضافه التاجر بنجاح",
      data: newSupplier
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= UPDATE =================
exports.updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;


    const updates = req.body;


    const oldSupplier = await supplierModel.findById(id);

    if (!oldSupplier) {
      return res.status(404).json({
        message: "هذا التاجر غير موجود",
      });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "من فضلك املاء جميع الحقول"
      });
    }

    
    if (!updates.name || updates.name.trim().length < 2) {
      return res.status(400).json({
        message: "اسم التاجر مطلوب"
      });
    }
    if(!updates.phone){
       return res.status(400).json({
        message: "رقم الهاتف مطلوب"
      });
    }


    const supplier = await supplierModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );


    const changes = [];

  if (oldSupplier.name !== supplier.name) {
    changes.push(`الاسم: "${oldSupplier.name}" ← "${supplier.name}"`);
  }

  if (oldSupplier.phone !== supplier.phone) {
    changes.push(`الهاتف: "${oldSupplier.phone}" ← "${supplier.phone}"`);
  }

  if ((oldSupplier.notes || "") !== (supplier.notes || "")) {
    changes.push(
      `الملاحظات: "${oldSupplier.notes || "لا يوجد"}" ← "${supplier.notes || "لا يوجد"}"`
    );
  }

  if (oldSupplier.balance !== supplier.balance) {
    changes.push(
      `الرصيد: ${oldSupplier.balance} ← ${supplier.balance}`
    );
  }



    res.status(200).json({
      message: "تم تحديث بيانات التاجر بنجاح",
      data: supplier
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSupplier = async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();

  session.startTransaction()
  try {
    const supplier = await supplierModel.findById(id);

    if (!supplier) {
      return res.status(404).json({
        message: "هذا المورد غير موجود",
      });
    }

    await supplierModel.findByIdAndDelete(id, { session });


    
    await session.commitTransaction();

    res.status(200).json({
      message: "تم حذف بيانات المورد بنجاح",
      data: supplier,
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





// دفع فلوس للتاجر   (تقليل دين عليا)
exports.paySupplier = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { amount, note,paymentMethod ,date } = req.body;
    const userId=req?.user?.userId;

    if (!paymentMethod || !["cash" , "wallet" ,"instapay","work"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "طريقة الدفع غير صحيحة"
      });
    }



    if (!amount || amount <= 0)
      return res.status(400).json({ message: "المبلغ لازم يكون قيمه موجبه" });


    const supplier = await supplierModel.findById(id).session(session);

    if (!supplier)
      return res.status(404).json({ message: "التاجر غير موجود" });

   
    const oldSupplier=supplier.balance;
    // supplier.balance += amount;
    supplier.balance = parseFloat((supplier.balance - amount).toFixed(2));

    await supplier.save({session});



    const paymentData = {
        supplier: id,
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
        provider: req.body.walletInfo.provider,
        senderName: req.body.walletInfo.senderName,
        senderPhone: req.body.walletInfo.senderPhone,
        receiverName: req.body.walletInfo.receiverName,
        receiverPhone: req.body.walletInfo.receiverPhone,
        transactionReference: req.body.walletInfo.transactionReference,
    };

}

    if (paymentMethod === "bank" || paymentMethod === "instapay") {
        paymentData.bankInfo = {
            bankName: req.body.bankInfo.bankName,
            transactionReference: req.body.bankInfo.transactionReference,
        };
    }


await paymentModel.create([paymentData], { session });




    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "تم دفع الميلغ  بنجاح",
      balance: supplier.balance
    });

  } catch (err) {
      await session.abortTransaction();
      session.endSession();
    res.status(500).json({ message: "Server error",   error: err.message });
  }
};



// استلام فلوس  (اضافه دين عليا )
exports.addDebt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { amount, note,paymentMethod ,date } = req.body;
    const userId=req?.user?.userId;

    if (!paymentMethod || !["cash" , "wallet" ,"instapay" ,"work" ].includes(paymentMethod)) {
      return res.status(400).json({
        message: "طريقة الدفع غير صحيحة"
      });
    }



    if (!amount || amount <= 0)
      return res.status(400).json({ message: "المبلغ لازم يكون قيمه موجبه" });


    const supplier = await supplierModel.findById(id).session(session);

    if (!supplier)
      return res.status(404).json({ message: "التاجر غير موجود" });

   
     const oldSupplier=supplier.balance;
    // supplier.balance += amount;
    supplier.balance = parseFloat((supplier.balance + amount).toFixed(2));

    await supplier.save({session});



    const paymentData = {
        supplier: id,
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


await paymentModel.create([paymentData], { session });


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


// Get all payments for one supplier
exports.allPaymentPerSupplier = async (req, res) => {
  try {
    const { id } = req.params;



    const payments = await paymentModel
      .find({ supplier: id })
      .sort({ createdAt: -1 })


    const totalPayments = await paymentModel.countDocuments({
      supplier: id,
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
    const { supplierId, paymentId } = req.params;
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

    // 2. جلب التاجرل
    const supplier = await supplierModel.findById(supplierId).session(session);
    if (!supplier) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "التاجرل غير موجود" });
    }

    // 3. جلب عملية الدفع القديمة
    const oldPayment = await paymentModel.findById(paymentId).session(session);
    if (!oldPayment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "عملية الدفع غير موجودة" });
    }

    // التأكد أن العملية تخص هذا التاجرل
    if (oldPayment.supplier.toString() !== supplierId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: "عملية الدفع لا تخص هذا التاجرل" });
    }

    // 4. حفظ الرصيد القديم للتسجيل
    const oldBalance = Number(supplier.balance || 0);
    const oldAmount = Number(oldPayment.amount || 0);
    const oldModule = oldPayment.module; // "debt" أو "pay"


    if (oldModule === "debt") {
      supplier.balance = parseFloat((supplier.balance - oldAmount).toFixed(2));
    } else if (oldModule === "pay") {
      supplier.balance = parseFloat((supplier.balance + oldAmount).toFixed(2));
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
    // 8. تحديث رصيد التاجرل بالعملية الجديدة
    // =========================================================
    if (module === "debt") {
      supplier.balance = parseFloat((supplier.balance + Number(amount)).toFixed(2));
    } else if (module === "pay") {
      supplier.balance = parseFloat((supplier.balance - Number(amount)).toFixed(2));
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
          ? `عملية استلام أموال من التاجرل ${supplier.name}`
          : `عملية إرسال أموال إلى التاجرل ${supplier.name}`,
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
    await supplier.save({ session });



    // =========================================================
    // 11. Commit
    // =========================================================
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم تعديل العملية بنجاح",
      payment: oldPayment,
      balance: supplier.balance,
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
    const { supplierId, paymentId } = req.params;
    const userId = req?.user?.userId;

    // 1. جلب التاجرل
    const supplier = await supplierModel.findById(supplierId).session(session);
    if (!supplier) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "التاجرل غير موجود" });
    }

    // 2. جلب عملية الدفع
    let payment = await paymentModel.findById(paymentId).session(session);



    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "عملية الدفع غير موجودة" });
    }

    // التأكد أن العملية تخص هذا التاجرل
    if (payment.supplier.toString() !== supplierId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: "عملية الدفع لا تخص هذا التاجرل" });
    }

    // 3. حفظ البيانات القديمة للتسجيل
    const oldBalance = Number(supplier.balance || 0);
    const amount = Number(payment.amount || 0);
    const module = payment.module; // "debt" أو "pay"

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("قيمة عملية الدفع غير صحيحة");
    }

    // =========================================================
    // 4. عكس تأثير العملية (حذفها من الرصيد)
 
    if (module === "debt") {
      supplier.balance = parseFloat((supplier.balance - amount).toFixed(2));
    } else if (module === "pay") {
      supplier.balance = parseFloat((supplier.balance + amount).toFixed(2));
    }

    // =========================================================
    // 5. حذف السجلات المرتبطة
    // =========================================================







    // =========================================================
    // 6. حذف عملية الدفع نفسها
    // =========================================================
    await paymentModel.findByIdAndDelete(payment._id).session(session);

    // =========================================================
    // 7. حفظ التاجرل
    // =========================================================
    await supplier.save({ session });


    // =========================================================
    // 9. Commit
    // =========================================================
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "تم حذف العملية بنجاح",
      balance: supplier.balance,
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




