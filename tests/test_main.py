import asyncio
import unittest
from unittest.mock import patch

from main import AnalysisRequest, analyze


class AnalyzeEndpointTests(unittest.TestCase):
    def test_analyze_accepts_plain_text_input(self):
        fake_response = type(
            "FakeResponse",
            (),
            {"text": '{"verdict": "Mostly True", "confidence": 0.8, "summary": "Test summary", "factors": {"source_credibility": {"rating": "High", "explanation": "Trusted source"}}}'},
        )()

        with patch("main.fetch_fact_checks", return_value="No fact-checks"), patch("main.client.models.generate_content", return_value=fake_response):
            response = asyncio.run(
                analyze(AnalysisRequest(content="This is a test article with enough content to be analyzed for the fake news detector."))
            )

        self.assertIn("ai_analysis", response)
        self.assertIn("fakeness_percentage", response)
        self.assertIn("summary", response)
        self.assertIn("verdict", response)


if __name__ == "__main__":
    unittest.main()
