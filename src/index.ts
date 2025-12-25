import { runKeypressMenu } from './menu';

async function main() {
  const result = await runKeypressMenu({
    Foo: () => console.log('doing foo…'),
    Jane: async () => console.log('doing jane…'),
    Lorem: () => console.log('doing lorem…'),
  } as const);

  if (result instanceof Error) {
    console.error('Error:', result.message);
    process.exit(1);
  }

  const [key] = result;
  console.log(`You selected: ${key}`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
