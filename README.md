# fromgit

Inspired by [`degit`](https://github.com/Rich-Harris/degit), [`cargo generate`](https://github.com/cargo-generate/cargo-generate), and [yeoman](https://yeoman.io) `fromgit` allows you to use git repositories as templates for new projects.

## Installation

```console
$ npm install -g fromgit
```

## Usage

```console
$ fromgit <git-url> <destination directory> [--silent] [--branch=...]
```

## Templates

Use a `.template` file in your project's root to define variables that `fromgit` will prompt a user for. Files included in the `templates` list will be processed as [ejs](https://ejs.co) templates with the user's input.

```yaml
name: Boilerplate project
description: Description for this project
templates:
  - my-template.md
variables:
  - name: name
    message: Enter the project name
    initial: My Awesome Project!
  - name: description
    message: What's your project's description?
```

Example `my-template.md`

```markdown
## <%- name %>

<%- description %>
```

## Environment variables & silent operation

`fromgit` will look for environment variables that look like `FROMGIT_[variable name]` to populate the initial values in the template. If you pass `--silent` to `fromgit` then you can automatically populate projects without interactive prompts.

## License

MIT
