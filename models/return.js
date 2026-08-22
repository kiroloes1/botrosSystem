const mongoose = require("mongoose");

const salesReturnItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Products",
      required: true,
    },

    productName: {
      type: String,
      required: true,
    },

    unit_type: {
      type: String,
      required: true,
    },

    // الكمية الموجودة في الفاتورة
    invoiceQuantity: {
      type: Number,
      required: true,
    },

    // الكمية التي تم إرجاعها
    returnQuantity: {
      type: Number,
      required: true,
      min: 1,
    },

    price: {
      type: Number,
      required: true,
    },

    subtotal: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const salesReturnSchema = new mongoose.Schema(
  {
    returnNumber: {
      type: String,
      required: true,
      unique: true,
    },

    // الفاتورة الأصلية
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
   
    },
     purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
    
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
  
    },
        supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      
    },



    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type:{
     type:String,
     default:"invoice",
     enum:["invoice","purchase"]
    },

    returnDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    items: {
      type: [salesReturnItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "يجب أن يحتوي المرتجع على منتج واحد على الأقل",
      },
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    note: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["completed", "cancelled"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  }
);

salesReturnSchema.index({ invoice: 1 });
salesReturnSchema.index({ customer: 1 });
salesReturnSchema.index({ returnDate: -1 });

salesReturnSchema.pre("validate", async function (next) {
  try {
    if (!this.returnNumber) {
      const lastReturn = await this.constructor
        .findOne({
          returnNumber: /^AGR-\d+$/,
        })
        .sort({ createdAt: -1 });

      let nextNumber = 1;

      if (lastReturn) {
        const lastNumber = parseInt(
          lastReturn.returnNumber.replace("AGR-", ""),
          10
        );

        nextNumber = lastNumber + 1;
      }

      this.returnNumber = `AGR-${nextNumber}`;
    }

  
  } catch (error) {
    console.log(error);
  }
});

const SalesReturn = mongoose.model(
  "SalesReturn",
  salesReturnSchema
);

module.exports = SalesReturn;