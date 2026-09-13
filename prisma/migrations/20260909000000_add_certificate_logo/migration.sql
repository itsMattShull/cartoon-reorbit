-- Logo shown on the player membership certificate, admin-uploaded via
-- Admin > Manage Certificate (falls back to /images/logo-reorbit.png when null).
ALTER TABLE "GlobalGameConfig" ADD COLUMN "certificateLogoPath" TEXT;
