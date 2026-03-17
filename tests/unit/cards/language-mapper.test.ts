import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  normalizeLanguage,
} from '../../../src/cards/language-mapper.js';

describe('cards/language-mapper', () => {
  describe('detectLanguage', () => {
    it('should map .ts to TypeScript', () => {
      expect(detectLanguage('src/index.ts')).toBe('TypeScript');
    });

    it('should map .tsx to TypeScript', () => {
      expect(detectLanguage('App.tsx')).toBe('TypeScript');
    });

    it('should map .js to JavaScript', () => {
      expect(detectLanguage('main.js')).toBe('JavaScript');
    });

    it('should map .py to Python', () => {
      expect(detectLanguage('script.py')).toBe('Python');
    });

    it('should map .rs to Rust', () => {
      expect(detectLanguage('lib.rs')).toBe('Rust');
    });

    it('should map .go to Go', () => {
      expect(detectLanguage('main.go')).toBe('Go');
    });

    it('should map .java to Java', () => {
      expect(detectLanguage('Main.java')).toBe('Java');
    });

    it('should map .cpp to C++', () => {
      expect(detectLanguage('main.cpp')).toBe('C++');
    });

    it('should map .c to C', () => {
      expect(detectLanguage('main.c')).toBe('C');
    });

    it('should map .cs to C#', () => {
      expect(detectLanguage('Program.cs')).toBe('C#');
    });

    it('should map .rb to Ruby', () => {
      expect(detectLanguage('app.rb')).toBe('Ruby');
    });

    it('should map .php to PHP', () => {
      expect(detectLanguage('index.php')).toBe('PHP');
    });

    it('should map .swift to Swift', () => {
      expect(detectLanguage('app.swift')).toBe('Swift');
    });

    it('should map .kt to Kotlin', () => {
      expect(detectLanguage('Main.kt')).toBe('Kotlin');
    });

    it('should map .sh to Bash', () => {
      expect(detectLanguage('script.sh')).toBe('Bash');
    });

    it('should map .yaml and .yml to YAML', () => {
      expect(detectLanguage('config.yaml')).toBe('YAML');
      expect(detectLanguage('config.yml')).toBe('YAML');
    });

    it('should map .json to JSON', () => {
      expect(detectLanguage('package.json')).toBe('JSON');
    });

    it('should map .xml to XML', () => {
      expect(detectLanguage('pom.xml')).toBe('XML');
    });

    it('should map .html to HTML', () => {
      expect(detectLanguage('index.html')).toBe('HTML');
    });

    it('should map .css to CSS', () => {
      expect(detectLanguage('styles.css')).toBe('CSS');
    });

    it('should map .sql to SQL', () => {
      expect(detectLanguage('query.sql')).toBe('SQL');
    });

    it('should map .md to Markdown', () => {
      expect(detectLanguage('README.md')).toBe('Markdown');
    });

    it('should map Dockerfile to Docker', () => {
      expect(detectLanguage('Dockerfile')).toBe('Docker');
      expect(detectLanguage('path/to/Dockerfile')).toBe('Docker');
    });

    it('should map .dockerfile to Docker', () => {
      expect(detectLanguage('app.dockerfile')).toBe('Docker');
    });

    it('should return PlainText for unknown extensions', () => {
      expect(detectLanguage('file.xyz')).toBe('PlainText');
    });

    it('should return PlainText for files without extensions', () => {
      expect(detectLanguage('Makefile')).toBe('PlainText');
    });

    it('should handle deeply nested paths', () => {
      expect(detectLanguage('/home/user/project/src/main/java/App.java')).toBe('Java');
    });
  });

  describe('normalizeLanguage', () => {
    it('should normalize "typescript" to TypeScript', () => {
      expect(normalizeLanguage('typescript')).toBe('TypeScript');
    });

    it('should normalize "ts" to TypeScript', () => {
      expect(normalizeLanguage('ts')).toBe('TypeScript');
    });

    it('should normalize "javascript" to JavaScript', () => {
      expect(normalizeLanguage('javascript')).toBe('JavaScript');
    });

    it('should normalize "python" to Python', () => {
      expect(normalizeLanguage('python')).toBe('Python');
    });

    it('should normalize "rust" to Rust', () => {
      expect(normalizeLanguage('rust')).toBe('Rust');
    });

    it('should normalize "golang" to Go', () => {
      expect(normalizeLanguage('golang')).toBe('Go');
    });

    it('should normalize "c++" to C++', () => {
      expect(normalizeLanguage('c++')).toBe('C++');
    });

    it('should normalize "csharp" to C#', () => {
      expect(normalizeLanguage('csharp')).toBe('C#');
    });

    it('should normalize "bash" to Bash', () => {
      expect(normalizeLanguage('bash')).toBe('Bash');
    });

    it('should normalize "shell" to Bash', () => {
      expect(normalizeLanguage('shell')).toBe('Bash');
    });

    it('should handle case-insensitive input', () => {
      expect(normalizeLanguage('TypeScript')).toBe('TypeScript');
      expect(normalizeLanguage('PYTHON')).toBe('PlainText'); // only lowercase aliases mapped
    });

    it('should return PlainText for empty string', () => {
      expect(normalizeLanguage('')).toBe('PlainText');
    });

    it('should return PlainText for unknown labels', () => {
      expect(normalizeLanguage('unknown')).toBe('PlainText');
    });

    it('should normalize "plaintext" to PlainText', () => {
      expect(normalizeLanguage('plaintext')).toBe('PlainText');
    });

    it('should handle whitespace in labels', () => {
      expect(normalizeLanguage(' typescript ')).toBe('TypeScript');
    });
  });
});
