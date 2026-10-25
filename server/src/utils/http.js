export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const paginate = (q) => {
  const page = Math.max(parseInt(q.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit) || 10, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};
