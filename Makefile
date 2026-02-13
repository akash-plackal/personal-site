SHELL := /usr/bin/env bash

.PHONY: build check clean serve

build:
	./scripts/build.sh

check:
	./scripts/check-budgets.sh dist

clean:
	rm -rf dist

serve: build
	python -m http.server --directory dist 8080
