from locust import HttpUser, task, between

class LostLinkUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        """Login at the start of each simulated user session"""
        response = self.client.post("/auth/login", json={
            "email": "theurge444backup@gmail.com",
            "password": "Asdfghjk1!"
        })
        
    @task(3)
    def view_dashboard(self):
        """Most common action — viewing the item feed"""
        self.client.get("/items/lost")
        self.client.get("/items/found")

    @task(2)
    def view_notifications(self):
        self.client.get("/notifications")

    @task(1)
    def ping(self):
        self.client.get("/ping")