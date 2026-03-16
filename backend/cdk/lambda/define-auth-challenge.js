/**
 * Cognito DefineAuthChallenge Lambda trigger.
 * Controls the CUSTOM_AUTH flow for phone+OTP sign-in.
 */
exports.handler = async (event) => {
  const session = event.request.session || [];

  if (session.length === 0) {
    // First call — issue a custom challenge (OTP)
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = "CUSTOM_CHALLENGE";
  } else {
    const lastChallenge = session[session.length - 1];
    if (
      lastChallenge.challengeName === "CUSTOM_CHALLENGE" &&
      lastChallenge.challengeResult === true
    ) {
      // OTP verified — issue tokens
      event.response.issueTokens = true;
      event.response.failAuthentication = false;
    } else {
      // Wrong OTP or unexpected state — fail
      event.response.issueTokens = false;
      event.response.failAuthentication = true;
    }
  }

  return event;
};
