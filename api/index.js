import apiHandler from '../server/api/[...path].js';

export default function handler(req, res) {
  const route = req.query.__api_path;
  if (
    typeof route !== 'string' ||
    !route ||
    route.startsWith('/') ||
    route.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return res.status(400).json({ message: 'Invalid API route.' });
  }

  const url = new URL(req.url, 'http://localhost');
  url.searchParams.delete('__api_path');
  req.url = `/api/${route}${url.search}`;

  return apiHandler(req, res);
}
