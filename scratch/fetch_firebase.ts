async function main() {
  try {
    const url = 'https://presencepro-ptb-default-rtdb.firebaseio.com/Employees.json';
    console.log('Fetching old employee registry from:', url);
    const res = await fetch(url);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Fetched Firebase Employees data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Firebase fetch failed:', err);
  }
}

main();
