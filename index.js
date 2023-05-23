const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const mysql = require("mysql2");

const app = express();
app.use(bodyParser.json());

// Create a MySQL connection pool
const pool = mysql.createPool({
  host: "bna88qkq9kexckmnlr53-mysql.services.clever-cloud.com",
  user: "u1fdguwnzcm6zhyw",
  password: "V6Zc6iCKQjb3wa0YAMK7",
  database: "bna88qkq9kexckmnlr53",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Generate OTP
app.get("/login", async (req, res) => {
  const email = req.query.email;

  try {
    // Check if there is an existing OTP for the user in the database
    const results = await queryPromise("SELECT * FROM otps WHERE email = ?", [
      email,
    ]);

    // Check the time gap since the last OTP generation
    const lastGeneratedTime = results.length > 0 ? results[0].timestamp : null;
    if (lastGeneratedTime && Date.now() - lastGeneratedTime < 60000) {
      return res.status(400).json({
        message: "Please wait for 1 minute before generating a new OTP",
      });
    }

    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Store the OTP in the database
    const timestamp = Date.now();
    if (results.length > 0) {
      await queryPromise(
        "UPDATE otps SET otp = ?, timestamp = ? WHERE email = ?",
        [otp, timestamp, email]
      );
    } else {
      await queryPromise(
        "INSERT INTO otps (email, otp, timestamp) VALUES (?, ?, ?)",
        [email, otp, timestamp]
      );
    }

    // Send the OTP to the user's email
    await sendEmail(email, otp);

    res.json({ message: "OTP generated and sent successfully" });
  } catch (err) {
    console.error("Error generating OTP:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/verify-otp", async (req, res) => {
  const email = req.query.email;
  const otp = req.query.otp;

  try {
    // Check if the stored OTP exists and is not expired
    const result = await queryPromise("SELECT * FROM otps WHERE email = ?", [
      email,
    ]);

    if (result.length > 0) {
      const storedOTP = result[0].otp;
      const expiresAt = new Date(
        new Date(result[0].timestamp).getTime() + 5 * 60 * 1000
      );
      const currentTimestamp = new Date();
      const blockedUntil = new Date(
        currentTimestamp.getTime() + 60 * 60 * 1000
      );

      if (
        result[0].blocked_until == null ||
        result[0].blocked_until < new Date()
      ) {
        if (otp == storedOTP && expiresAt > new Date()) {
          await queryPromise("DELETE FROM otps WHERE email = ?", [email]);

          const token = jwt.sign({ email }, "your_secret_key", {
            expiresIn: "1h",
          });
          res.status(200).json({
            message: "OTP verification successful. You are logged in.",
            token: token,
          });
        } else {
          if (result[0].attempts >= 4) {
            await queryPromise(
              "UPDATE otps SET attempts = 0, blocked_until = ? WHERE email = ?",
              [blockedUntil, email]
            );
            res.status(200).json({
              message:
                "For too many wrong attempts, Gmail is blocked. Try again after 1 hour.",
            });
          } else {
            await queryPromise(
              "UPDATE otps SET attempts = attempts + 1 WHERE email = ?",
              [email]
            );
            res.status(200).json({
              message: "OTP is invalid",
            });
          }
        }
      } else {
        res.status(200).json({
          message: "Gmail is blocked. Try again after 1 hour.",
        });
      }
    } else {
      res.status(200).json({
        message: "Gmail is incorrect",
      });
    }
  } catch (err) {
    console.error("Failed to verify OTP:", err);
    res.status(500).json({ message: "Failed to verify OTP" });
  }
});

// Function to send the OTP to the user's email
function sendEmail(email, otp) {
  return new Promise((resolve, reject) => {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "projectwork.rohit@gmail.com",
        pass: "lxfadwwpkggtdcmr",
      },
    });

    const mailOptions = {
      from: "projectwork.rohit@gmail.com",
      to: email,
      subject: "OTP for Login",
      text: `Your OTP is: ${otp}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        reject(error);
      } else {
        console.log("Email sent:", info.response);
        resolve(info.response);
      }
    });
  });
}

// Promisify MySQL query method
function queryPromise(sql, values) {
  return new Promise((resolve, reject) => {
    pool.query(sql, values, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

// Start the server
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
