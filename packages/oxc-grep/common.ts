/// <reference types="npm:@oxc-project/types@0.49.0" />
import type { ParseResult } from 'npm:oxc-parser@0.49.0';
// @deno-types="npm:@types/esquery@1.5.4"
import type esquery from 'npm:esquery@1.6.0';

export const EXTENSIONS = [
    'js',
    'mjs',
    'cjs',
    'jsx',
    'ts',
    'tsx',
    'mts',
];

export interface OXCGrepOptions {
    beforeContext: number;
    afterContext: number;
    printFilenames: boolean;
    printLineNumbers: boolean;
    color: boolean;
}

export interface ReadASTResult {
    content: string;
    ast: ParseResult;
}

export type WorkerEventInput = FindASTMatchesOptions;

export interface FindASTMatchesOptions {
    file: string;
    patterns: esquery.Selector[];
    options: OXCGrepOptions;
    root: string;
}

export type TextRange = [
    start: number,
    end: number,
];

export type LineContent = [lineNo: number, content: string];

export interface ExtractedLinesAndContext {
    beforeContext: LineContent[];
    matchedLines: LineContent[];
    afterContext: LineContent[];
}

export interface LineIndex {
    index: number;
    lineNo: number;
}

export interface FindASTMatchesOutput {
    result?: string;
}

export type WorkerEventOutput =
    | Partial<FindASTMatchesOutput>
    | undefined;
