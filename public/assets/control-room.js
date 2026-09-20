// Pages owns file-looking static paths. Keep this loader logic-free and fetch
// the canonical onboarding implementation through an extensionless API route,
// which the Pages edge forwards to the FCR Worker service binding.
import '/founder-onboarding-script';
