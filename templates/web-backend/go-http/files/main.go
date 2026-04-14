package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type Item struct {
	Name        string  `json:"name"`
	Description string  `json:"description,omitempty"`
	Price       float64 `json:"price"`
}

type Message struct {
	Message string `json:"message"`
}

type HealthResponse struct {
	Status string `json:"status"`
}

type CreateItemResponse struct {
	Item   Item   `json:"item"`
	Action string `json:"action"`
}

func main() {
	http.HandleFunc("/", rootHandler)
	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/items", createItemHandler)

	port := {{port}}
	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("Server running on port %d\n", port)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	response := Message{Message: "Hello from {{project-name}}!"}
	json.NewEncoder(w).Encode(response)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	response := HealthResponse{Status: "ok"}
	json.NewEncoder(w).Encode(response)
}

func createItemHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var item Item
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	response := CreateItemResponse{Item: item, Action: "created"}
	json.NewEncoder(w).Encode(response)
}
