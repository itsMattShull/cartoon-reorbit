import * as Sentry from "@sentry/nuxt";
 
Sentry.init({
  dsn: "https://74d19ccab004a793b83bdd461e20921c@o4509353035038720.ingest.us.sentry.io/4509353043230720",
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
