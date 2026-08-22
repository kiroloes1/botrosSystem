const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
{
    // ===========================
    // Factory Information
    // ===========================
    factoryName: {
        type: String,
        required: true,
        trim: true
    },

    invoiceFactoryName: {
        type: String,
        required: true,
        trim: true
    },


    // ===========================
    // System Icon - Cloudinary
    // ===========================
    icon: {
      url: {
        type: String,
        trim: true,
        default: null,
      },
      publicId: {
        type: String,
        trim: true,
        default: null,
      },
    },

        iconInvoices: {
      url: {
        type: String,
        trim: true,
        default: null,
      },
      publicId: {
        type: String,
        trim: true,
        default: null,
      },
    },



    // ===========================
    // Fonts
    // ===========================
    systemFont: {
        type: String,
        default: "Cairo"
    },

    invoiceFont: {
        type: String,
        default: "Hooz"
    },

phones: {
  type: [String],
  default: []
}
,
    // ===========================
    // Theme Colors
    // ===========================
    theme: {
        primary: {
            type: String,
            default: "#25343F"
        },

        secondary: {
            type: String,
            default: "#BFC9D1"
        },

        accent: {
            type: String,
            default: "#FF9B51"
        },

        background: {
            type: String,
            default: "#EAEFEF"
        }
    },

    // ===========================
    // Financial Security
    // ===========================
    financialPin: {
        type: String,
        default:"123456"
    },
    financialPinUpdatedBy: {
          type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
    },
    financialPinUpdatedDate:{
       type:Date,
       default: ""
    },
    updatedBy:{
           type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
       
    }

},
{
    timestamps:true
});

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);