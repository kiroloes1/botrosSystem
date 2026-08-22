const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema({
    product: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Products", 
        required: true 
    },

    productName: { 
        type: String, 
        required: true 
    },

    unit_type: { 
        type: String, 
        required: true 
    },

    quantity: { 
        type: Number, 
        required: true 
    },

    price: { 
        type: Number, 
        required: true 
    },

    subtotal: { 
        type: Number, 
    }
    

}, { _id: false }); // to reduce size

const purchaseSchema = new mongoose.Schema({

    purchaseDate:{
         type: Date,
         required: true,
    },
    supplier: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Supplier", 
        required: true 
    },
   user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: true 
    },
    oldSupplierBalance:{
      type:Number

    },
    purchaseNumber: {
        type: String,
        required: true,
        unique: true
    },

      items: {
      type: [purchaseItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "يجب أن تحتوي الفاتورة على منتج واحد على الأقل",
      },
    },

    // pricing
    totalPrice: { 
        type: Number, 
        required: true 
    },


    paidAmount:{
      type:Number
    },

    discount:{
        type: Number, 
         default: 0,
        min: 0,
    },
        finalPrice: { 
        type: Number, 
        required: true 
    },


    // purchase status
    status: {
            type: String,
            enum: ["unpaid","partPaid" ,"paid", "return"],
            default: "unpaid"
        },

    // admin
    adminNote: {
        type: String,
        default: ""
    },


}, { timestamps: true });


purchaseSchema.index({ purchaseDate: -1 });


purchaseSchema.index({ status: 1 });


purchaseSchema.index({ customer: 1, createdAt: -1 });


purchaseSchema.index({ createdAt: -1 });


purchaseSchema.index({ purchaseNumber: -1 });




// AUTO ORDER NUMBER
purchaseSchema.pre("validate", async function (next) {
  try {
    if (!this.purchaseNumber) {
      const lastOrder = await this.constructor
        .findOne({
          purchaseNumber: /^AGP-\d+$/,
        })
        .sort({ createdAt: -1 });

      let nextNumber = 1;

      if (lastOrder) {
        const lastNumber = parseInt(
          lastOrder.purchaseNumber.replace("AGP-", ""),
          10
        );

        nextNumber = lastNumber + 1;
      }

      this.purchaseNumber = `AGP-${nextNumber}`;
    }


  } catch (error) {
    next(error);
  }
});


const purchase = mongoose.model("Purchase", purchaseSchema);
module.exports = purchase;
