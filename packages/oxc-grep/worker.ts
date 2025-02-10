import { parseAsync, type Span } from 'npm:oxc-parser@0.48.2';
import { basename, isGlob, relative, resolve } from 'jsr:@std/path@1.0.8';
import { readAll } from 'jsr:@std/io@0.225.2/read-all';
// @deno-types="npm:@types/esquery@1.5.4"
import esquery from 'npm:esquery@1.6.0';
import {
	type TaskAsyncFunction,
	ThreadWorker,
} from 'jsr:@poolifier/poolifier-web-worker@0.4.31';
import {
	type ContextOptions,
	type ExpandGlobsOptions,
	type ExpandGlobsOutput,
	EXTENSIONS,
	type FindASTMatchesOptions,
	type FindASTMatchesOutput,
	type ParsedMatch,
	type ReadASTResult,
	type WorkerEventInput,
	type WorkerEventOutput,
} from './common.ts';
import {
	expandGlob,
	type ExpandGlobOptions,
	type WalkEntry,
} from 'jsr:@std/fs@1.0.11/expand-glob';
import ansiStyles from 'npm:ansi-styles@6.2.1';

const textDecoder = new TextDecoder();

export async function* expandGlobs(
	{ paths, root, exclude = [] }: ExpandGlobsOptions,
): AsyncIterableIterator<WalkEntry> {
	const options: ExpandGlobOptions = {
		exclude,
		includeDirs: false,
		root,
	};

	for (const path of paths) {
		if (isGlob(path)) {
			yield* expandGlob(path, options);
		} else {
			try {
				const { isFile, isDirectory, isSymlink } = await Deno
					.stat(path);

				if (isDirectory) {
					yield* expandGlob(
						`${path}/**/*.{${EXTENSIONS.join(',')}}`,
						{ exclude, includeDirs: false },
					);
				} else {
					const resolved = resolve(path);

					yield {
						path: resolved,
						isFile,
						isDirectory,
						isSymlink,
						name: basename(resolved),
					};
				}
			} catch {
				console.error(`Path not found: ${path}`);
				continue;
			}
		}
	}
}

export const parseMatch = (
	filename: string,
	content: string,
	node: Span,
	{ before, after }: ContextOptions,
	root: string,
): ParsedMatch => {
	const lines = content.split('\n');
	const matchLineIndex = content.slice(0, node.start).split('\n').length - 1;
	const startLine = Math.max(0, matchLineIndex - before);
	const endLine = Math.min(lines.length - 1, matchLineIndex + after);
	const lineText = lines[matchLineIndex];
	const lineStartOffset = content.lastIndexOf('\n', node.start - 1) + 1;
	const matchColStart = node.start - lineStartOffset;
	const matchColEnd = node.end - lineStartOffset;
	const highlightedLine = lineText.slice(0, matchColStart) +
		ansiStyles.red.open +
		lineText.slice(matchColStart, matchColEnd) +
		ansiStyles.red.close +
		lineText.slice(matchColEnd);
	const filenameColored = ansiStyles.magenta.open + relative(root, filename) +
		ansiStyles.magenta.close;
	let snippet = `${filenameColored}\n`;
	for (let i = startLine; i <= endLine; i++) {
		const marker = i === matchLineIndex ? ':' : '-';
		const lineNumColored = ansiStyles.green.open + (i + 1) +
			ansiStyles.green.close;
		snippet +=
			`${lineNumColored}${ansiStyles.reset.open}${marker}${ansiStyles.reset.close} ${
				i === matchLineIndex ? highlightedLine : lines[i]
			}\n`;
	}
	return {
		filename,
		line: matchLineIndex + 1,
		column: matchColStart,
		content: snippet.trim(),
	};
};

export const readAST = async (path: string): Promise<ReadASTResult> => {
	const file = await Deno.open(path);
	const raw = await readAll(file);
	const content = textDecoder.decode(raw);
	const parseResult = await parseAsync(path, content);

	file.close();

	return {
		content,
		ast: parseResult,
	};
};

const findASTMatchesTask: TaskAsyncFunction<
	FindASTMatchesOptions,
	FindASTMatchesOutput | undefined
> = async (data) => {
	if (data) {
		const { file, patterns, context, root } = data;
		const { content, ast } = await readAST(file);
		const results: ParsedMatch[] = [];

		for (const pattern of patterns) {
			// @ts-expect-error - we're using AST from a different parser so the types don't match
			const matches = esquery.query(ast.program, pattern) as Span[];

			for (const match of matches) {
				results.push(parseMatch(file, content, match, context, root));
			}
		}

		return {
			matches: results,
		};
	}
};
const expandGlobsTask: TaskAsyncFunction<
	ExpandGlobsOptions,
	ExpandGlobsOutput | undefined
> = async (data) => {
	if (data) {
		const files = await Array.fromAsync(expandGlobs(data));

		return {
			files: files.map(({ path }) => path),
		};
	}
};

export default new ThreadWorker<WorkerEventInput, WorkerEventOutput>({
	findASTMatches: findASTMatchesTask,
	expandGlobs: expandGlobsTask,
});
