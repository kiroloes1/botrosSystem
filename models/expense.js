const mongoose = require('mongoose');

const expenseItemSchema = new mongoose.Schema({
  title: { type: String, required:true ,trim: true }, // عيش - أكل - سكاكين
  amount: { type: Number,min: 0 },
  note: { type: String, default: "" }
});

const expenseSchema = new mongoose.Schema({
  expenseDate: {
    type: Date,
    default: Date.now
  },
  items: [expenseItemSchema],  

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  totalAmount: {
  type: Number,
  default: 0
}
}, { timestamps: true });

expenseSchema.pre('save', function () {
  this.totalAmount = this.items.reduce((sum, item) => {
    return sum + item.amount;
  }, 0);
});
module.exports = mongoose.model('Expense', expenseSchema);