const prisma = require('../config/prisma');

const getRequestIp = (req) =>
  req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null;

const writeAuditLog = async ({
  req,
  actorAuthUserId,
  actorAcademicUserId,
  action,
  targetType,
  targetId,
  metadata = {},
}) => {
  try {
    await prisma.auditLog.create({
      data: {
        actor_auth_user_id: actorAuthUserId || req?.user?.authUserId || null,
        actor_user_id: actorAcademicUserId || req?.user?.academicUserId || req?.user?.userId || null,
        action,
        target_type: targetType || null,
        target_id: targetId || null,
        ip_address: req ? getRequestIp(req) : null,
        user_agent: req?.headers?.['user-agent'] || null,
        metadata,
      },
    });
  } catch (error) {
    console.error('AuditLog Error:', error);
  }
};

const writeSecurityEvent = async ({
  req,
  authUserId,
  academicUserId,
  event,
  provider,
  metadata = {},
}) => {
  try {
    await prisma.userSecurityEvent.create({
      data: {
        auth_user_id: authUserId || req?.user?.authUserId || null,
        academic_user_id: academicUserId || req?.user?.academicUserId || req?.user?.userId || null,
        event,
        provider: provider || req?.user?.claims?.app_metadata?.provider || null,
        ip_address: req ? getRequestIp(req) : null,
        user_agent: req?.headers?.['user-agent'] || null,
        metadata,
      },
    });
  } catch (error) {
    console.error('SecurityEvent Error:', error);
  }
};

module.exports = {
  writeAuditLog,
  writeSecurityEvent,
};

