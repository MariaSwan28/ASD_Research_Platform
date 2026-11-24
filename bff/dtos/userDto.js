class UserDto {
    email;
    id;
    isActivated;

    constructor(model) {
        this.fullName = model.fullName || '';
        this.role = model.role || 'parent';
        this.email = model.email;
        this.id = model._id;
        this.isActivated = model.isActivated;
    }
}

export { UserDto }