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

export interface ContextOptions {
    before: number;
    after: number;
}

export interface ParsedMatch {
    filename: string;
    line: number;
    column: number;
    content: string;
}

export interface ReadASTResult {
    content: string;
    ast: ParseResult;
}

export interface ExpandGlobsOptions {
    paths: string[];
    root: string;
    exclude?: string[];
}

export interface ExpandGlobsOutput {
    files: string[];
}

export type WorkerEventInput = FindASTMatchesOptions & ExpandGlobsOptions;

export interface FindASTMatchesOptions {
    file: string;
    patterns: esquery.Selector[];
    context: ContextOptions;
    root: string;
}

export interface FindASTMatchesOutput {
    matches: ParsedMatch[];
}
export type WorkerEventOutput =
    | Partial<FindASTMatchesOutput & ExpandGlobsOutput>
    | undefined;
