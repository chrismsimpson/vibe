import * as vibe from './vibe';

// export type VibeScriptResult = {

// };

// export const exec = async (
//   {
//     contents
//   }:
//   {
//     contents: string;
//   }
// ): Promise<VibeScriptResult | Error> => {

//   return new Error('not implemented');
// }

// const parsed = vibe.parseVibeScript(contents);

//   if (parsed instanceof Error) {
//     console.error(parsed);

//     process.exit(1);
//   }

//   const checked = vibe.typeCheckVibeScript(parsed);

//   if (checked instanceof Error) {
//     console.error(checked);

//     process.exit(1);
//   }

//   console.dir(checked, { depth: null });
