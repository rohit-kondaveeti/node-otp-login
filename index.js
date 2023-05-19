const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const mysql = require("mysql2");

const app = express();
app.use(bodyParser.json());

// Create a MySQL connection pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "otp-login",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Generate OTP
app.get("/login", (req, res) => {
  const email = req.query.email;

  // Check if there is an existing OTP for the user in the database
  pool.query("SELECT * FROM otps WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error("Error fetching OTP from database:", err);
      return res.status(500).json({ message: "Internal Server Error1" });
    }

    // Check the time gap since the last OTP generation
    pool.query(
      "SELECT timestamp FROM otps WHERE email = ? ORDER BY timestamp DESC LIMIT 1",
      [email],
      (err, results) => {
        if (err) {
          console.error(
            "Error fetching last OTP generation timestamp from database:",
            err
          );
          return res.status(500).json({ message: "Internal Server Error2" });
        }

        const lastGeneratedTime =
          results.length > 0 ? results[0].timestamp : null;
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
          pool.query(
            "UPDATE otps set otp =?, timestamp=? WHERE email= ? ",
            [otp, timestamp, email],

            (err) => {
              if (err) {
                console.error("Error saving OTP to database:", err);
                return res
                  .status(500)
                  .json({ message: "Internal Server Error4" });
              }

              // Send the OTP to the user's email
              sendEmail(email, otp);

              res.json({ message: "OTP generated and sent successfully1" });
            }
          );
        } else {
          pool.query(
            "INSERT INTO otps (email, otp, timestamp) VALUES (?, ?, ?)",
            [email, otp, timestamp],
            (err) => {
              if (err) {
                console.error("Error saving OTP to database:", err);
                return res
                  .status(500)
                  .json({ message: "Internal Server Error3" });
              }

              // Send the OTP to the user's email
              sendEmail(email, otp);

              res.json({ message: "OTP generated and sent successfully" });
            }
          );
        }
      }
    );
  });
});

app.get("/verify-otp", (req, res) => {
  const email = req.query.email;
  const otp = req.query.otp;

  // Check if the stored OTP exists and is not expired
  const sql = "SELECT * FROM otps WHERE email = ?";

  pool.query(sql, [email], (err, result) => {
    if (err) {
      console.error("Failed to fetch OTP from the database:", err);
      res.status(500).json({ message: "Failed to verify OTP." });
    } else {
      if (result.length > 0) {
        const storedOTP = result[0].otp;
        const expiresAt = new Date(
          new Date(result[0].timestamp).getTime() + 5 * 60 * 1000
        );
        const currentTimestamp = new Date();
        const blocked_untill = new Date(
          currentTimestamp.getTime() + 60 * 60 * 1000
        );
        console.log(blocked_untill);
        console.log(new Date());
        if (
          result[0].blocked_untill == null ||
          result[0].blocked_untill < new Date()
        ) {
          if (otp == storedOTP && expiresAt > new Date()) {
            pool.query(
              "DELETE FROM otps WHERE email=?",
              [email],
              (err, result)
            );
            const token = jwt.sign({ email }, "your_secret_key", {
              expiresIn: "1h",
            });
            res.status(200).json({
              message: "OTP verification successful. You are logged in.",
              token: token,
            });
          } else {
            if (result[0].attempts >= 4) {
              pool.query(
                "UPDATE otps SET attempts=0 , blocked_untill= ? WHERE email=?",
                [blocked_untill, email],
                (err, result)
              );
              res.status(200).json({
                message:
                  "For too many Wrong attempts Gmail is blocked try after 1 hour",
              });
            } else {
              pool.query(
                "UPDATE otps SET attempts=attempts+1 WHERE email=?",
                [email],
                (err, result)
              );
              res.status(200).json({
                message: "Otp is invalid",
              });
            }
          }
        } else {
          res.status(200).json({
            message: "Gmail is blocked try after 1 hour",
          });
        }
      } else {
        res.status(200).json({
          message: "Gmail is incorrect",
        });
      }
    }
  });
});

// Function to send the OTP to the user's email
function sendEmail(email, otp) {
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
      console.log("Error sending email:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
}

// Start the server
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
