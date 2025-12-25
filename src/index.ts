import { runKeypressMenu } from './menu';

async function main() {
  await runKeypressMenu({
    Foo: () => console.log('doing foo…'),
    Jane: async () => console.log('doing jane…'),
    Lorem: () => console.log('doing lorem…'),
  } as const);

  process.exit(0);
}

main().catch(err => {
  if (err instanceof Error && 'code' in err && err.code === 'SIGINT') {
    process.exit(130);
  }
  console.error(err);
  process.exit(1);
});
