const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    // =========================
    // Basic Information
    // =========================

    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    category: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    companyName: {
      type: String,
      trim: true,
      default: "اسم الشركه غير مذكور",
      index: true,
    },

    // =========================
    // Units
    // =========================

    unit_type: {
      type: String,
      required: true,
      enum: ["قطعة", "كرتونة"],
    },

    unitsPerPackage: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    // =========================
    // Stock
    // =========================

    availableQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    totalUnits: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =========================
    // Prices
    // =========================

    packageSellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    pieceSellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // =========================
    // Image
    // =========================

    image: {
      url: {
        type: String,
        default: "",
      },

      publicId: {
        type: String,
        default: "",
      },
    },

    // =========================
    // Status
    // =========================

    status: {
      type: String,
      enum: ["active", "inactive", "out-of-stock"],
      default: "active",
      index: true,
    },

    // =========================
    // Expiration
    // =========================

    expiration: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// =====================================================
// TEXT SEARCH
// =====================================================

productSchema.index({
  productName: "text",
  description: "text",
  category: "text",
  companyName: "text",
});

// =====================================================
// STOCK INDEX
// =====================================================

productSchema.index({
  status: 1,
  availableQuantity: 1,
});

// =====================================================
// EXPIRATION
// =====================================================



// =====================================================
// PRE SAVE
// =====================================================

productSchema.pre("save", function (next) {

  // =========================
  // Calculate total units
  // =========================

  if (this.unit_type === "كرتونة") {

    this.totalUnits =
      this.availableQuantity * this.unitsPerPackage;

  } else {

    this.totalUnits =
      this.availableQuantity;

  }

  // =========================
  // Calculate status
  // =========================

  if (this.status !== "inactive") {

    if (this.availableQuantity > 0) {
      this.status = "active";
    } else {
      this.status = "out-of-stock";
    }

  }

//   next();
});

const Product = mongoose.model(
  "Products",
  productSchema
);

module.exports = Product;