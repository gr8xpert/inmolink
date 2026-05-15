-- Add USER_LOGIN_FAILED to AuditEventType so failed credentials login,
-- TOTP failure, and throttle rejections can be audited as a class.

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'USER_LOGIN_FAILED';
