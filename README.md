# Teratask - Periodic and on demand node.js task runner


## Dependencies

    * Redis
    * TeraFoundation

## Task implementation

    Tasks are defined as node.js modules.

```
    scheduler.schedule({
        task_name: 'my_task', // String task identifier
        queue_name: 'task:queue', // Redis queue to watch for tasks postings
        task: tasks.MyTask, // Task implementation 
        interval: 5000, // How often to wakeup the task and check the queue. (milliseconds)
        max_in_flight: 20 // maximum number of task instances that can be running
    }); 
```