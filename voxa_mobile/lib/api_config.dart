// Shared API configuration for Voxa mobile.
// Keep this in sync with web/.env.local VITE_API_BASE_URL.
const String apiBase =
    'https://6kbd4veax6.execute-api.us-east-1.amazonaws.com';

// Cognito — USER_PASSWORD_AUTH direct REST (no Amplify/hosted UI).
const String cognitoRegion = 'us-east-1';
const String cognitoClientId = '54h640jfhu7pdfv1032erjc5i6';
const String cognitoEndpoint =
    'https://cognito-idp.us-east-1.amazonaws.com/';
