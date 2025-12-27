async function main() {
  console.log('hello world');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
