const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    balance: {
      type: Number,
      default: 0,
    },

    openningBalance: {
      type: Number,
      default: 0,
    },
     openningBalanceDate: {
      type: Date,
      default: "2000-05-06T11:30:07.105+00:00",
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },


  },
  {
    timestamps: true,
  }
);

customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 });

module.exports = mongoose.model("Customer", customerSchema);