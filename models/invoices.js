const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema({
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

const invoiceSchema = new mongoose.Schema({

    invoiceDate:{
         type: Date,
         required: true,
    },
    customer: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Customer", 
        required: true 
    },
   user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
       
    },
    oldCustomerBalance:{
      type:Number

    },
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    paidAmount:{
      type:Number
    },

      items: {
      type: [invoiceItemSchema],
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




    discount:{
        type: Number, 
         default: 0,
        min: 0,
    },
        finalPrice: { 
        type: Number, 
        required: true 
    },




    // invoice status
    status: {
            type: String,
            enum: ["unpaid", "paid", "return"],
            default: "unpaid"
        },

    // admin
    adminNote: {
        type: String,
        default: ""
    },


}, { timestamps: true });


invoiceSchema.index({ invoiceDate: -1 });


invoiceSchema.index({ status: 1 });


invoiceSchema.index({ customer: 1, createdAt: -1 });


invoiceSchema.index({ createdAt: -1 });


invoiceSchema.index({ invoiceNumber: -1 });




// AUTO ORDER NUMBER
invoiceSchema.pre("validate", async function (next) {
  try {
    if (!this.invoiceNumber) {
      const lastOrder = await this.constructor
        .findOne({
          invoiceNumber: /^AGI-\d+$/,
        })
        .sort({ createdAt: -1 });

      let nextNumber = 1;

      if (lastOrder) {
        const lastNumber = parseInt(
          lastOrder.invoiceNumber.replace("AGI-", ""),
          10
        );

        nextNumber = lastNumber + 1;
      }

      this.invoiceNumber = `AGI-${nextNumber}`;
    }


  } catch (error) {
    next(error);
  }
});


const Invoice = mongoose.model("Invoice", invoiceSchema);
module.exports = Invoice;
