/// <reference types="@oxc-project/types" />
import type { ParseResult } from 'oxc-parser';
import type esquery from 'esquery';

export const EXTENSIONS = [
    'js',
    'mjs',
    'cjs',
    'jsx',
    'ts',
    'cts',
    'tsx',
    'mts',
];

export interface OXCGrepOptions {
    beforeContext: number;
    afterContext: number;
    printFilenames: boolean;
    printLineNumbers: boolean;
    printExact: boolean;
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
