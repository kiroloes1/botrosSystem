const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    // ===========================
    // Customer OR Supplier
    // ===========================
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    // ===========================
    // Related Module
    // ===========================
    module: {
      type: String,
      enum: [
        "pay",    //دفع
        "debt",   // مديونيه 
        "invoices",  // فوتير        
        "purchase",   //مشتريات    

      ],
      required: true,
    },

    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ===========================
    // Payment
    // ===========================
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      enum: [
        "cash",
        "wallet",
        "instapay",
        "work"
      ],
      required: true,
    },
    moneyFlow: {
    type: String,
    enum: ["incoming", "outgoing"],
    required: true
},

    // ===========================
    // Wallet Details
    // ===========================
    walletInfo: {

      senderName: String,
      senderPhone: String,
      receiverName: String,
      receiverPhone: String,
    },

    // ===========================
    // Bank / Instapay
    // ===========================
    bankInfo: {
        bankName: {
            type: String,
            trim: true
        },


    },




    // ===========================
    // General
    // ===========================
    transactionDate: {
      type: Date,
      required: true,
    },

    notes: {
      type: String,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);



// ===========================
// Indexes
// ===========================
paymentSchema.index({ customer: 1 });
paymentSchema.index({ supplier: 1 });
paymentSchema.index({ module: 1 });
paymentSchema.index({ moduleId: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ transactionDate: -1 });

module.exports = mongoose.model("Payment", paymentSchema);