/// <reference types="npm:@oxc-project/types@0.49.0" />
import { parseAsync, type Span } from 'npm:oxc-parser@0.49.0';
import { basename, isGlob, resolve } from 'jsr:@std/path@1.0.8';
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
    type ParsedContentMatch,
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

const renderMatch = (
    content: string,
    start: number,
    end: number,
    { before, after }: ContextOptions,
): ParsedContentMatch => {
    const lines = content.split('\n');
    const startLineIndex = content.slice(0, start).split('\n').length - 1;
    const endLineIndex = content.slice(0, end).split('\n').length - 1;
    const startOffset = content.lastIndexOf('\n', start - 1) + 1;
    const startCol = start - startOffset;
    const endOffset = content.lastIndexOf('\n', end - 1) + 1;
    const endCol = end - endOffset;
    const contextStart = Math.max(0, startLineIndex - before);
    const contextEnd = Math.min(lines.length - 1, endLineIndex + after);
    let snippet = '';
    for (let i = contextStart; i <= contextEnd; i++) {
        const marker = i >= startLineIndex && i <= endLineIndex ? ':' : '-';
        let lineContent = lines[i];
        if (i === startLineIndex && i === endLineIndex) {
            lineContent = lineContent.slice(0, startCol) +
                ansiStyles.red.open +
                lineContent.slice(startCol, endCol) +
                ansiStyles.red.close +
                lineContent.slice(endCol);
        } else if (i === startLineIndex) {
            lineContent = lineContent.slice(0, startCol) +
                ansiStyles.red.open +
                lineContent.slice(startCol) +
                ansiStyles.red.close;
        } else if (i === endLineIndex) {
            lineContent = ansiStyles.red.open +
                lineContent.slice(0, endCol) +
                ansiStyles.red.close +
                lineContent.slice(endCol);
        } else if (i > startLineIndex && i < endLineIndex) {
            lineContent = ansiStyles.red.open + lineContent +
                ansiStyles.red.close;
        }
        snippet += ansiStyles.green.open + (i + 1) + ansiStyles.green.close +
            ansiStyles.reset.open + marker + ansiStyles.reset.close + ' ' +
            lineContent + '\n';
    }
    return {
        line: startLineIndex + 1,
        column: startCol,
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
        const { file, patterns, context } = data;
        const { content, ast } = await readAST(file);
        const intervals: { start: number; end: number }[] = [];
        for (const pattern of patterns) {
            // Use query to retrieve matching nodes instead of match
            const matches = esquery.match(
                // @ts-ignore - this is an error if the types are available because we're using AST from a different parser so the types don't match,
                // but we ignore it because sometimes the types will error in the deno language server
                ast.program,
                pattern,
            ) as Span[];
            for (const match of matches) {
                intervals.push({ start: match.start, end: match.end });
            }
        }
        intervals.sort((a, b) => a.start - b.start);
        const merged: { start: number; end: number }[] = [];
        for (const cur of intervals) {
            const last = merged[merged.length - 1];
            if (!last || cur.start > last.end) {
                merged.push({ ...cur });
            } else {
                last.end = Math.max(last.end, cur.end);
            }
        }
        const contentMatches = merged.map((interval) =>
            renderMatch(
                content,
                interval.start,
                interval.end,
                context,
            )
        );
        if (contentMatches.length) {
            return { matches: [{ filename: file, matches: contentMatches }] };
        }
        // return { matches: [{ filename: file, matches: contentMatches }] };
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
