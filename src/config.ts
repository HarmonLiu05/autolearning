import "dotenv/config";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  headless: process.env.HEADLESS === "true",
  keepOpen: process.env.KEEP_OPEN === "true",
  artifactsDir: "artifacts",
  educoderUsername: getRequiredEnv("EDUCODER_USERNAME"),
  educoderPassword: getRequiredEnv("EDUCODER_PASSWORD"),
};
