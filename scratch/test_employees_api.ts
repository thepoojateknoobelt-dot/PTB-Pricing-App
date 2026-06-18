import jwt from 'jsonwebtoken';

const JWT_SECRET = 'super-secret-key';
const token = jwt.sign({ username: 'admin', role: 'admin', email: 'admin@ptb.com' }, JWT_SECRET);

async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/employees', {
      headers: {
        Cookie: `token=${token}`
      }
    });
    console.log(`API call finished with status: ${res.status}`);
    const data = await res.json();
    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error('API call failed:', err.message);
  }
}
main();
