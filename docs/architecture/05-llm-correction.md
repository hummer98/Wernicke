# LLM補正パイプライン - 設計仕様

## 概要

LLM補正パイプラインは、Whisperによる音声認識結果を、Qwen2.5-14B-Instructモデルで補正し、自然な日本語文章に整形する役割を担います。同音異義語の修正、文脈に応じた表現の改善、句読点の適切な配置を実現します。

## 目的

### 1. 同音異義語の修正

音声認識では、同じ発音の異なる漢字を正しく選択できないことがあります。

**例**:
- 「きかい」→ 機会 / 機械 / 器械 / 奇怪
- 「こうせい」→ 構成 / 校正 / 公正 / 更正
- 「いし」→ 意思 / 意志 / 医師 / 石

LLMは文脈から適切な漢字を選択します。

### 2. 自然な文章への整形

音声認識結果は、話し言葉そのままで読みにくいことがあります。

**例**:
- Before: 「えーとですね今日はあの機会学習についてお話ししたいと思います」
- After: 「今日は機械学習についてお話しします」

### 3. 句読点の適切な配置

音声には句読点がないため、読みやすさのために適切な位置に配置します。

**例**:
- Before: 「今日は機械学習について話しますまず基礎からはじめます」
- After: 「今日は機械学習について話します。まず基礎からはじめます。」

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ LLM Correction Pipeline                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input: Whisper transcription segments                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Context Aggregation                               │  │
│  │                                                      │  │
│  │  - Group segments by speaker                        │  │
│  │  - Maintain conversation context                    │  │
│  │  - Preserve timestamps                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2. Prompt Engineering                                │  │
│  │                                                      │  │
│  │  - System prompt: Role definition                   │  │
│  │  - User prompt: Original text + instructions        │  │
│  │  - Few-shot examples: Quality improvement           │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 3. LLM Inference (Qwen2.5-14B-Instruct)              │  │
│  │                                                      │  │
│  │  - Model: qwen2.5:14b-instruct-q4_0                 │  │
│  │  - VRAM: 6-8GB                                      │  │
│  │  - Latency: ~1-3 seconds per segment                │  │
│  │  - Context window: 32K tokens                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 4. Response Parsing                                  │  │
│  │                                                      │  │
│  │  - Extract corrected text                           │  │
│  │  - Validate output format                           │  │
│  │  - Fallback to original on error                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 5. Segment Reconstruction                            │  │
│  │                                                      │  │
│  │  - Merge corrected text with metadata               │  │
│  │  - Mark corrected segments                          │  │
│  │  - Preserve speaker labels and timestamps           │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  Output: Corrected segments                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## モデル選定

### Qwen2.5-14B-Instruct

**選定理由**:
1. **日本語性能**: LlamaやMixtralより日本語理解が優れている
2. **サイズ**: q4_0量子化で6-8GB VRAM（RTX 3090で余裕）
3. **速度**: 14Bパラメータで推論速度とクオリティのバランスが良い
4. **指示追従性**: Instructチューニングにより、プロンプトに従いやすい

**代替案との比較**:

| モデル | VRAM | 日本語 | 速度 | 総合 |
|--------|------|--------|------|------|
| Qwen2.5-14B-q4_0 | 6-8GB | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Llama-3.1-8B-q4_0 | 4-5GB | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Mixtral-8x7B-q4_0 | 12-15GB | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

## プロンプトエンジニアリング

### システムプロンプト

```python
SYSTEM_PROMPT = """あなたは音声認識結果を補正する専門家です。

以下のルールに従ってテキストを補正してください:

1. 同音異義語を文脈から判断して正しい漢字に修正する
2. 話し言葉のフィラー(「えー」「あの」等)を削除する
3. 冗長な表現を簡潔にする
4. 適切な位置に句読点を配置する
5. 元の意味を変えないこと
6. 補正後のテキストのみを出力すること(説明や注釈は不要)

【重要】元のテキストと意味が大きく変わる場合は、そのまま出力してください。"""
```

### ユーザープロンプト（基本形）

```python
def create_user_prompt(original_text: str) -> str:
    return f"""音声認識結果: {original_text}

補正後のテキストのみを出力してください。"""
```

### Few-shot Examples

補正品質を向上させるため、プロンプトに例を含めます。

```python
FEW_SHOT_EXAMPLES = """
例1:
音声認識結果: えーと今日はきかいがくしゅうについて話します
補正後: 今日は機械学習について話します

例2:
音声認識結果: このいしは重要ですがそのいしは確認できません
補正後: この意思は重要ですが、その意志は確認できません

例3:
音声認識結果: こうせいの結果をみてこうせいをおこないます
補正後: 校正の結果を見て更正を行います
"""
```

### 完全なプロンプト構成

```python
def build_full_prompt(original_text: str) -> str:
    return f"""{SYSTEM_PROMPT}

{FEW_SHOT_EXAMPLES}

音声認識結果: {original_text}

補正後のテキストのみを出力してください。"""
```

## 実装

### CorrectionPipeline

```python
from ollama import Client
from typing import List, Dict
import asyncio

class CorrectionPipeline:
    def __init__(self, config: dict):
        self.ollama = Client(host=config.get("host", "http://localhost:11434"))
        self.model = config.get("model", "qwen2.5:14b-instruct-q4_0")
        self.timeout = config.get("timeout", 60)
        self.batch_size = config.get("batch_size", 5)

    async def correct_segments(
        self,
        segments: List[Dict]
    ) -> List[Dict]:
        """セグメントリストを補正"""
        corrected = []

        # バッチ処理
        for i in range(0, len(segments), self.batch_size):
            batch = segments[i:i+self.batch_size]
            batch_results = await self._process_batch(batch)
            corrected.extend(batch_results)

        return corrected

    async def _process_batch(
        self,
        batch: List[Dict]
    ) -> List[Dict]:
        """バッチ処理"""
        tasks = []

        for segment in batch:
            task = self._correct_single_segment(segment)
            tasks.append(task)

        # 並列実行
        return await asyncio.gather(*tasks)

    async def _correct_single_segment(
        self,
        segment: Dict
    ) -> Dict:
        """単一セグメントの補正"""
        original_text = segment.get("text", "")

        # 空文字や短すぎるテキストはスキップ
        if not original_text or len(original_text) < 3:
            return {
                **segment,
                "corrected": False
            }

        try:
            # プロンプト構築
            prompt = self._build_prompt(original_text)

            # LLM推論
            response = await asyncio.to_thread(
                self.ollama.generate,
                model=self.model,
                prompt=prompt,
                options={
                    "temperature": 0.1,  # 低温度で安定した出力
                    "top_p": 0.9,
                    "num_predict": 512,  # 最大トークン数
                }
            )

            corrected_text = response["response"].strip()

            # バリデーション
            if not corrected_text or len(corrected_text) > len(original_text) * 2:
                # 出力が不正な場合は元のテキストを使用
                corrected_text = original_text
                is_corrected = False
            else:
                is_corrected = (corrected_text != original_text)

            return {
                **segment,
                "text": corrected_text,
                "corrected": is_corrected,
                "original_text": original_text if is_corrected else None
            }

        except Exception as e:
            print(f"Correction failed: {e}")
            # エラー時は元のテキストを使用
            return {
                **segment,
                "corrected": False
            }

    def _build_prompt(self, original_text: str) -> str:
        """プロンプト構築"""
        return f"""{SYSTEM_PROMPT}

{FEW_SHOT_EXAMPLES}

音声認識結果: {original_text}

補正後のテキストのみを出力してください。"""
```

### Context-Aware Correction

文脈を考慮した補正のため、複数セグメントをまとめて処理します。

```python
class ContextAwareCorrectionPipeline(CorrectionPipeline):
    async def correct_segments_with_context(
        self,
        segments: List[Dict],
        context_window: int = 3
    ) -> List[Dict]:
        """文脈を考慮した補正"""
        corrected = []

        for i, segment in enumerate(segments):
            # 前後のセグメントを文脈として取得
            context_start = max(0, i - context_window)
            context_end = min(len(segments), i + context_window + 1)
            context_segments = segments[context_start:context_end]

            # 文脈付きプロンプト
            corrected_segment = await self._correct_with_context(
                segment,
                context_segments,
                target_index=i - context_start
            )

            corrected.append(corrected_segment)

        return corrected

    async def _correct_with_context(
        self,
        target_segment: Dict,
        context_segments: List[Dict],
        target_index: int
    ) -> Dict:
        """文脈を含めた補正"""
        # 文脈テキストを構築
        context_texts = [seg.get("text", "") for seg in context_segments]
        context_str = "\n".join([
            f"{'→ ' if i == target_index else '  '}{text}"
            for i, text in enumerate(context_texts)
        ])

        prompt = f"""{SYSTEM_PROMPT}

以下は会話の流れです。「→」で示された行を補正してください。

{context_str}

補正後のテキストのみを出力してください。"""

        # LLM推論
        response = await asyncio.to_thread(
            self.ollama.generate,
            model=self.model,
            prompt=prompt
        )

        corrected_text = response["response"].strip()
        is_corrected = (corrected_text != target_segment.get("text", ""))

        return {
            **target_segment,
            "text": corrected_text,
            "corrected": is_corrected,
            "original_text": target_segment.get("text") if is_corrected else None
        }
```

## パフォーマンス最適化

### 1. バッチ処理

複数セグメントをまとめて1回のLLM呼び出しで処理します。

```python
async def batch_correct(segments: List[Dict]) -> List[Dict]:
    """複数セグメントをまとめて補正"""
    texts = [seg.get("text", "") for seg in segments]

    prompt = f"""{SYSTEM_PROMPT}

以下の{len(texts)}個のテキストを補正してください。

{chr(10).join([f"{i+1}. {text}" for i, text in enumerate(texts)])}

補正後のテキストを番号付きリストで出力してください。"""

    response = await ollama.generate(prompt)

    # レスポンスをパース
    corrected_texts = parse_numbered_list(response["response"])

    # セグメントに適用
    return [
        {
            **seg,
            "text": corrected_texts[i],
            "corrected": corrected_texts[i] != seg.get("text")
        }
        for i, seg in enumerate(segments)
    ]
```

### 2. キャッシング

同じテキストの補正結果をキャッシュします。

```python
from functools import lru_cache
import hashlib

class CachedCorrectionPipeline(CorrectionPipeline):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cache = {}

    async def _correct_single_segment(self, segment: Dict) -> Dict:
        original_text = segment.get("text", "")

        # キャッシュキー生成
        cache_key = hashlib.md5(original_text.encode()).hexdigest()

        # キャッシュヒット
        if cache_key in self.cache:
            return {
                **segment,
                **self.cache[cache_key]
            }

        # LLM推論
        result = await super()._correct_single_segment(segment)

        # キャッシュ保存
        self.cache[cache_key] = {
            "text": result["text"],
            "corrected": result["corrected"],
            "original_text": result.get("original_text")
        }

        return result
```

### 3. 並列処理

複数セグメントを並列で補正します。

```python
async def parallel_correct(
    segments: List[Dict],
    max_concurrent: int = 5
) -> List[Dict]:
    """並列補正"""
    semaphore = asyncio.Semaphore(max_concurrent)

    async def correct_with_semaphore(segment: Dict) -> Dict:
        async with semaphore:
            return await correct_single_segment(segment)

    tasks = [correct_with_semaphore(seg) for seg in segments]
    return await asyncio.gather(*tasks)
```

## エラーハンドリング

### タイムアウト処理

```python
async def correct_with_timeout(
    segment: Dict,
    timeout: int = 30
) -> Dict:
    """タイムアウト付き補正"""
    try:
        return await asyncio.wait_for(
            correct_single_segment(segment),
            timeout=timeout
        )
    except asyncio.TimeoutError:
        print(f"Correction timeout for: {segment.get('text')}")
        return {
            **segment,
            "corrected": False
        }
```

### リトライロジック

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10)
)
async def correct_with_retry(segment: Dict) -> Dict:
    """リトライ付き補正"""
    return await correct_single_segment(segment)
```

## 評価指標

### 補正品質の測定

```python
class CorrectionEvaluator:
    def evaluate(
        self,
        original_segments: List[Dict],
        corrected_segments: List[Dict]
    ) -> Dict:
        """補正品質を評価"""
        metrics = {
            "total_segments": len(original_segments),
            "corrected_count": 0,
            "average_length_change": 0,
            "correction_rate": 0
        }

        length_changes = []

        for orig, corr in zip(original_segments, corrected_segments):
            if corr.get("corrected"):
                metrics["corrected_count"] += 1

                orig_len = len(orig.get("text", ""))
                corr_len = len(corr.get("text", ""))
                length_changes.append(corr_len - orig_len)

        metrics["correction_rate"] = (
            metrics["corrected_count"] / metrics["total_segments"]
            if metrics["total_segments"] > 0
            else 0
        )

        metrics["average_length_change"] = (
            sum(length_changes) / len(length_changes)
            if length_changes
            else 0
        )

        return metrics
```

## テスト

### ユニットテスト

```python
import pytest

@pytest.mark.asyncio
async def test_homophone_correction():
    pipeline = CorrectionPipeline(config)

    segment = {
        "text": "今日はきかいについて話します",
        "start": 0.0,
        "end": 2.5
    }

    result = await pipeline._correct_single_segment(segment)

    assert result["corrected"] == True
    assert "機械" in result["text"] or "機会" in result["text"]

@pytest.mark.asyncio
async def test_filler_removal():
    pipeline = CorrectionPipeline(config)

    segment = {
        "text": "えーとですね今日は話します",
        "start": 0.0,
        "end": 2.5
    }

    result = await pipeline._correct_single_segment(segment)

    assert "えーと" not in result["text"]
    assert "ですね" not in result["text"] or result["corrected"] == True
```

### 統合テスト

```python
@pytest.mark.asyncio
async def test_full_pipeline():
    pipeline = CorrectionPipeline(config)

    segments = [
        {"text": "今日はきかいについて", "start": 0.0, "end": 2.0},
        {"text": "話をします", "start": 2.1, "end": 3.5}
    ]

    corrected = await pipeline.correct_segments(segments)

    assert len(corrected) == len(segments)
    assert all("text" in seg for seg in corrected)
    assert all("corrected" in seg for seg in corrected)
```

## 監視とログ

### パフォーマンスログ

```python
import time

class LoggingCorrectionPipeline(CorrectionPipeline):
    async def _correct_single_segment(self, segment: Dict) -> Dict:
        start_time = time.time()

        result = await super()._correct_single_segment(segment)

        elapsed = time.time() - start_time

        print(f"Correction: {elapsed:.2f}s | "
              f"Original: {segment.get('text')[:30]}... | "
              f"Corrected: {result.get('text')[:30]}... | "
              f"Changed: {result.get('corrected')}")

        return result
```

## 次のドキュメント

- [06-deployment.md](./06-deployment.md) - デプロイメントガイド
- [01-overview.md](./01-overview.md) - システム概要に戻る
