.PHONY: patch minor major test

# Run tests
test:
	npm test

# Publish a patch version and push the release tag to GitHub Actions.
patch:
	npm version patch
	git push origin main --tags

# Publish a minor version and push the release tag to GitHub Actions.
minor:
	npm version minor
	git push origin main --tags

# Publish a major version and push the release tag to GitHub Actions.
major:
	npm version major
	git push origin main --tags
