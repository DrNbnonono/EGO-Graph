# EGO-Graph User Guide

Start the terminal experience:

```bash
ego
```

Run the controlled web pentest scenario:

```bash
ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id demo-run-001
```

Replay the decision trail:

```bash
ego replay --trajectory-id demo-run-001
```

Check readiness:

```bash
ego doctor
```

Run the evaluation dataset:

```bash
ego eval --dataset datasets/evals/web_pentest.jsonl
```

