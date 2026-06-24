import ollama
import time

start = time.time()

response = ollama.chat(
    model="qwen2.5:14b-instruct",
    messages=[
        {
            "role": "user",
            "content": "Return only this JSON: {\"test\": true}"
        }
    ]
)

print(response["message"]["content"])
print("Time:", time.time() - start)