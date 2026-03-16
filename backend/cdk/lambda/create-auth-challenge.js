/**
 * Cognito CreateAuthChallenge Lambda trigger.
 * Generates a 6-digit OTP and sends it via SNS SMS (phone users only).
 * Email OTP is handled separately via Cognito's ForgotPassword flow
 * (built-in email, no SES needed).
 */
const AWS = require("aws-sdk");
const sns = new AWS.SNS();

/** Hardcoded OTP for a specific test/demo account (always accepted in VerifyAuthChallenge too). */
const HARDCODED_OTP_EMAIL = "rehaan@mobil80.com";
const HARDCODED_OTP_CODE = "061628";

exports.handler = async (event) => {
  if (event.request.challengeName !== "CUSTOM_CHALLENGE") {
    return event;
  }

  const email = (event.request.userAttributes?.email || event.userName || "")
    .toString()
    .trim()
    .toLowerCase();
  const isHardcodedUser = email === HARDCODED_OTP_EMAIL;

  // Use fixed OTP for hardcoded user; otherwise generate 6-digit OTP
  const otp = isHardcodedUser ? HARDCODED_OTP_CODE : String(Math.floor(100000 + Math.random() * 900000));

  // Only phone users go through CUSTOM_AUTH — send SMS (skip for hardcoded email user)
  const phone = event.request.userAttributes?.phone_number;

  if (phone && phone.startsWith("+") && !isHardcodedUser) {
    try {
      await sns
        .publish({
          PhoneNumber: phone,
          Message: `Your Yandle verification code is: ${otp}`,
          MessageAttributes: {
            "AWS.SNS.SMS.SMSType": {
              DataType: "String",
              StringValue: "Transactional",
            },
          },
        })
        .promise();
      console.log(`[create-auth-challenge] OTP sent via SMS to ${phone.slice(0, 6)}***`);
    } catch (err) {
      console.error("[create-auth-challenge] SMS send failed:", err.message);
    }
  } else {
    console.warn("[create-auth-challenge] No phone number for user:", event.userName);
  }

  event.response.publicChallengeParameters = { phone: phone || "" };
  event.response.privateChallengeParameters = { otp };
  event.response.challengeMetadata = "OTP_CHALLENGE";

  return event;
};
