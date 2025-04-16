/// <reference types="@oxc-project/types" />
import { parseAsync, type Span } from 'oxc-parser';
import { relative } from '@std/path';
import { readAll } from '@std/io/read-all';
import esquery from 'esquery';
import {
    type TaskAsyncFunction,
    ThreadWorker,
} from '@poolifier/poolifier-web-worker';
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
