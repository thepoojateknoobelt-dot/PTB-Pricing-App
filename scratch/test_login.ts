async function main() {
  try {
    console.log('Sending login request to http://localhost:3000/api/auth/login...');
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@ptb.com',
        password: 'admin'
      })
    });
    
    console.log('Response status from port 3000:', res.status);
    const text = await res.text();
    console.log('Response body:', text);
  } catch (err: any) {
    console.error('Failed to query:', err);
  }
}

main();
