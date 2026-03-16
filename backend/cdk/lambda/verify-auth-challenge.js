/**
 * Cognito VerifyAuthChallengeResponse Lambda trigger.
 * Validates the OTP provided by the user against the expected OTP.
 * For rehaan@mobil80.com, "061628" is always accepted as valid.
 */
const HARDCODED_OTP_EMAIL = "rehaan@mobil80.com";
const HARDCODED_OTP_CODE = "061628";

exports.handler = async (event) => {
  const expected = event.request.privateChallengeParameters?.otp;
  const answer = (event.request.challengeAnswer || "").trim();
  const email = (event.request.userAttributes?.email || event.userName || "")
    .toString()
    .trim()
    .toLowerCase();
  const isHardcodedUser = email === HARDCODED_OTP_EMAIL;

  const correct =
    (expected && answer === expected) ||
    (isHardcodedUser && answer === HARDCODED_OTP_CODE);

  event.response.answerCorrect = correct;

  return event;
};
