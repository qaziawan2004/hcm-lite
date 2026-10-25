import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

export async function audit(req, action, entity, entityId, details = '') {
  try {
    await AuditLog.create({
      actor: req.user?._id, actorName: req.user?.name, role: req.user?.role,
      action, entity, entityId: entityId ? String(entityId) : undefined, details, ip: req.ip,
    });
  } catch (e) { console.error('audit failed', e.message); }
}

export async function notify(userIds, title, message = '', link = '') {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(String))];
  if (!ids.length) return;
  await Notification.insertMany(ids.map((user) => ({ user, title, message, link })));
}

export async function notifyRoles(roles, title, message, link, exceptId) {
  const users = await User.find({ role: { $in: roles }, status: 'active' }).select('_id');
  await notify(users.map((u) => u._id).filter((id) => String(id) !== String(exceptId)), title, message, link);
}
