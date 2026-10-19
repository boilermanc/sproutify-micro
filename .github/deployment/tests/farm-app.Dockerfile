FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends bash rsync coreutils findutils python3 python3-yaml shellcheck ca-certificates && rm -rf /var/lib/apt/lists/*
ENV DEPLOY_TEST_SANDBOX=1
WORKDIR /tests
CMD ["python3", "/repo/.github/deployment/tests/test_farm_deploy.py"]
