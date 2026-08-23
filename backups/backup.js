const express = require("express");
const router = express.Router();
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const cron = require("node-cron");
require("dotenv").config();

const authorizationMiddleware = require(`${__dirname}/../middlewares/authorization`);
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/* =========================
   DATABASE HELPER
========================= */

async function getDB() {
  const client = new MongoClient(process.env.DATABASE);

  await client.connect();

  return {
    client,
    db: client.db(),
  };
}

/* =========================
   SAVE TOKENS
========================= */

async function saveTokens(tokens) {
  const { client, db } = await getDB();

  await db.collection("google_tokens").updateOne(
    { type: "google_drive" },
    {
      $set: {
        tokens,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  await client.close();
}

/* =========================
   GET TOKENS
========================= */

async function getTokens() {
  const { client, db } = await getDB();

  const tokenDoc = await db.collection("google_tokens").findOne({
    type: "google_drive",
  });

  await client.close();

  if (!tokenDoc) {
    throw new Error("Google tokens not found");
  }

  return tokenDoc.tokens;
}

/* =========================
   AUTO UPDATE TOKENS
========================= */

oauth2Client.on("tokens", async (tokens) => {
  try {
    const currentTokens = await getTokens();

    const updatedTokens = {
      ...currentTokens,
      ...tokens,
    };

    await saveTokens(updatedTokens);

    console.log("🔄 Google tokens updated");
  } catch (err) {
    console.log("❌ Token update failed:", err.message);
  }
});

/* =========================
   GOOGLE LOGIN
========================= */
router.use((req, res, next) => {
  if (req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }

  next();
});
router.get(
  "/auth/google",
  authMiddleware.protected,
  authorizationMiddleware.role("superadmin", "manager"),
  (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
     scope: [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
],
    });

    res.redirect(url);
  }
);

/* =========================
   CALLBACK
========================= */

router.get("/oauth2callback", async (req, res) => {
  try {
    const { code } = req.query;

    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    await saveTokens(tokens);

    res.send("✅ Google Auth Success");
  } catch (err) {
    console.log(err);

    res.status(500).send(err.message);
  }
});


/* =========================
   UPDATE LAST BACKUP DATE
========================= */

async function updateLastBackupDate() {
  const { client, db } = await getDB();

  try {
    await db.collection("google_tokens").updateOne(
      { type: "google_drive" },
      {
        $set: {
          lastBackupAt: new Date(),
        },
      }
    );
  } finally {
    await client.close();
  }
}

/* =========================
   CREATE BACKUP
========================= */

async function createBackup() {
  const { client, db } = await getDB();

  try {
    const collections = await db.listCollections().toArray();

    let backup = {};

    for (const col of collections) {
      backup[col.name] = await db
        .collection(col.name)
        .find({})
        .toArray();
    }

    const fileName = "botrosSystemBackup.json";

    // استخدم /tmp بدل __dirname
    const filePath = path.join("/tmp", fileName);

    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));

    const tokens = await getTokens();

    oauth2Client.setCredentials(tokens);

    const drive = google.drive({
      version: "v3",
      auth: oauth2Client,
    });

    const existingFiles = await drive.files.list({
      q: `name='${fileName}' and trashed=false`,
      fields: "files(id, name)",
    });

    if (existingFiles.data.files.length > 0) {
      const fileId = existingFiles.data.files[0].id;

      await drive.files.update({
        fileId,
        media: {
          mimeType: "application/json",
          body: fs.createReadStream(filePath),
        },
      });

     
    } else {
      await drive.files.create({
        requestBody: {
          name: fileName,
        },
        media: {
          mimeType: "application/json",
          body: fs.createReadStream(filePath),
        },
      });

      
    }

    await updateLastBackupDate();

    // حذف الملف المؤقت
    fs.unlinkSync(filePath);
  } catch (err) {
    console.log("❌ Backup Error:", err.message);

    throw err;
  } finally {
    await client.close();
  }
}

/* =========================
   MANUAL BACKUP DATA
========================= */

async function createBackupManual() {
  const { client, db } = await getDB();

  try {
    const collections = await db.listCollections().toArray();

    let backup = {};

    for (const col of collections) {
      backup[col.name] = await db
        .collection(col.name)
        .find({})
        .toArray();
    }

    return backup;
  } finally {
    await client.close();
  }
}

/* =========================
   DAILY AUTO BACKUP
========================= */

cron.schedule(
  "0 18 * * *",
  async () => {
    console.log("⏰ Running daily backup...");

    try {
      await createBackup();
    } catch (err) {
      console.log("❌ Auto backup failed:", err.message);
    }
  },
  {
    timezone: "Africa/Cairo",
  }
);

/* =========================
   PROTECTED ROUTES
========================= */


/* =========================
   BACKUP ROUTE
========================= */

router.get("/backup", async (req, res) => {
  try {
    await createBackup();

    res.json({
      success: true,
      message: "✅ Backup completed",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.use(authMiddleware.protected);

router.use(
  authorizationMiddleware.role("superadmin", "manager")
);


/* =========================
   MANUAL DATA ROUTE
========================= */

router.get("/backupMaual", async (req, res) => {
  try {
    const data = await createBackupManual();

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});


router.get("/lastUpdate", async (req, res) => {
  try {
      const { client, db } = await getDB();

  const tokenDoc = await db.collection("google_tokens").findOne({
    type: "google_drive",
  });

  await client.close();

  if (!tokenDoc) {
    throw new Error("Google tokens not found");
  }


  

    res.json({
      success: true,
      updatedAt:tokenDoc.updatedAt,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});


router.get("/google-account", async (req, res) => {
  try {
    const tokens = await getTokens();

    oauth2Client.setCredentials(tokens);

  
    await oauth2Client.getAccessToken();

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const userInfo = await oauth2.userinfo.get();

    res.json({
      success: true,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;


