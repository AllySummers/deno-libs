/// <reference types="npm:@oxc-project/types@0.49.0" />
import { parseAsync, type Span } from 'npm:oxc-parser@0.49.0';
import { relative } from 'jsr:@std/path@1.0.8';
import { readAll } from 'jsr:@std/io@0.225.2/read-all';
// @deno-types="npm:@types/esquery@1.5.4"
import esquery from 'npm:esquery@1.6.0';
import {
    type TaskAsyncFunction,
    ThreadWorker,
} from 'jsr:@poolifier/poolifier-web-worker@0.4.31';
import type {
    FindASTMatchesOptions,
    FindASTMatchesOutput,
    ReadASTResult,
    TextRange,
    WorkerEventInput,
    WorkerEventOutput,
} from './common.ts';
import { extractLinesAndContext, formatMatchOutput } from './grep-print.ts';

const textDecoder = new TextDecoder();

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
        const { file, patterns, options, root } = data;
        const { content, ast } = await readAST(file);
        const matchedRanges: TextRange[] = [];

        for (const pattern of patterns) {
            const matches = esquery.match(
                // @ts-ignore - this is an error if the types are available because we're using AST from a different parser so the types don't match,
                // but we ignore it because sometimes the types will error in the deno language server
                ast.program,
                pattern,
            ) as unknown as Span[];

            matchedRanges.push(
                ...matches.map<TextRange>((m) => [
                    m.start,
                    m.end,
                ]),
            );
        }

        const relativePath = relative(root, file);

        const mergedRanges = extractLinesAndContext(
            content,
            matchedRanges,
            options,
        );

        const formatted = mergedRanges.length
            ? formatMatchOutput(
                relativePath,
                mergedRanges,
                options,
            )
            : undefined;

        return {
            result: formatted,
        };
    }
};

export default new ThreadWorker<WorkerEventInput, WorkerEventOutput>({
    findASTMatches: findASTMatchesTask,
});
