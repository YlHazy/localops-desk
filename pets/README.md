# Installable Codex pet assets

Only final, installable Codex pet sprite sheets belong in this directory.

The repository delivery gate currently accepts a stricter subset of the
official upload formats: a PNG must be exactly 1536 × 1872, no larger than
20 MiB, contain image data, and encode an alpha channel or `tRNS` transparency.
WebP remains an official Codex upload format, but this repository blocks it
until equivalent metadata validation is implemented.

Character concepts and hatch references belong under `docs/02-design/`; they
must never be copied here merely to make them look installable.
